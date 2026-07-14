"""Inference — loads and runs the three model tiers with graceful fallback.

Priority order per model:
  YOLO:        runs/sentinel/yolov8s_idd/weights/best.pt  (your fine-tune)
               -> yolov8n.pt COCO pretrained (auto-downloads)
               -> demo simulator (no ultralytics installed)
  AccidentCNN: weights/accident_cnn_best.pt -> heuristic from box overlap
  SeverityNet: models/ann/weights_severity_net.pt (shipped, trained) -> required

The pipeline works out of the box and upgrades itself as your trained
weights appear at the paths above. Every fallback is reported in /health
so a demo never silently lies about what's running.
"""
from __future__ import annotations

import io
import random
from pathlib import Path

import numpy as np
import torch

from .features import extract_features

FINETUNED_YOLO = Path("runs/sentinel/yolov8s_idd/weights/best.pt")
ACCIDENT_WEIGHTS = Path("weights/accident_cnn_best.pt")
ANN_WEIGHTS = Path("models/ann/weights_severity_net.pt")

# COCO ids we keep, mapped to Sentinel class names
COCO_KEEP = {0: "person", 1: "bicycle", 2: "car", 3: "motorcycle",
             5: "bus", 7: "truck"}
PRIORITY_CLASSES = ["LOW", "MEDIUM", "HIGH"]


class ModelManager:
    def __init__(self) -> None:
        self.status: dict[str, str] = {}
        self._load_yolo()
        self._load_accident_cnn()
        self._load_severity_net()

    # ------------------------------------------------------------------ YOLO
    def _load_yolo(self) -> None:
        self.yolo = None
        try:
            from ultralytics import YOLO
            if FINETUNED_YOLO.exists():
                self.yolo = YOLO(str(FINETUNED_YOLO))
                self.status["yolo"] = "fine-tuned (IDD)"
            else:
                self.yolo = YOLO("yolov8n.pt")
                self.status["yolo"] = "pretrained COCO (fine-tune pending)"
        except Exception as e:  # ultralytics missing / download blocked
            self.status["yolo"] = f"demo simulator ({type(e).__name__})"

    # ----------------------------------------------------------- AccidentCNN
    def _load_accident_cnn(self) -> None:
        self.accident_cnn = None
        if ACCIDENT_WEIGHTS.exists():
            import sys
            sys.path.insert(0, "training/accident_cnn")
            from model import AccidentCNN  # type: ignore
            m = AccidentCNN()
            m.load_state_dict(torch.load(ACCIDENT_WEIGHTS, map_location="cpu"))
            m.eval()
            self.accident_cnn = m
            self.status["accident_cnn"] = "trained"
        else:
            self.status["accident_cnn"] = "heuristic (train pending)"

    # ----------------------------------------------------------- SeverityNet
    def _load_severity_net(self) -> None:
        import sys
        sys.path.insert(0, "models/ann")
        from severity_net import SeverityNet  # type: ignore
        ckpt = torch.load(ANN_WEIGHTS, map_location="cpu", weights_only=False)
        self.severity_net = SeverityNet()
        self.severity_net.load_state_dict(ckpt["state_dict"])
        self.severity_net.eval()
        self.mu, self.sd = ckpt["mu"], ckpt["sd"]
        self.status["severity_net"] = "trained (synthetic bootstrap)"

    # ------------------------------------------------------------- detection
    def detect(self, image_bytes: bytes | None, demo: bool = False) -> dict:
        if demo or self.yolo is None or image_bytes is None:
            return self._demo_detections()
        from PIL import Image
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        res = self.yolo(img, verbose=False)[0]
        boxes = []
        names = res.names
        for b in res.boxes:
            cls_id = int(b.cls)
            name = names.get(cls_id, str(cls_id))
            if self.status["yolo"].startswith("pretrained"):
                if cls_id not in COCO_KEEP:
                    continue
                name = COCO_KEEP[cls_id]
            xyxy = b.xyxy[0].tolist()
            boxes.append({"cls": name, "conf": round(float(b.conf), 3),
                          "xyxy": [round(v, 1) for v in xyxy]})
        return {
            "boxes": boxes,
            "collision_conf": self._collision_conf(boxes, img.size),
            "pothole_conf": 0.0,  # needs IDD fine-tune classes
            "img_size": list(img.size),
        }

    def _collision_conf(self, boxes: list[dict], img_size) -> float:
        """Trained CNN if available; else IoU-overlap heuristic between vehicles."""
        if self.accident_cnn is not None:
            return 0.0  # wired in pipeline.classify_frame with the actual tensor
        best = 0.0
        vehicles = [b for b in boxes if b["cls"] not in {"person"}]
        for i in range(len(vehicles)):
            for j in range(i + 1, len(vehicles)):
                best = max(best, _iou(vehicles[i]["xyxy"], vehicles[j]["xyxy"]))
        return round(min(best * 1.6, 0.99), 3)

    def classify_frame(self, image_bytes: bytes) -> float:
        """AccidentCNN probability for the accident class."""
        if self.accident_cnn is None:
            return 0.0
        from PIL import Image
        from torchvision import transforms
        tfm = transforms.Compose([
            transforms.Resize((224, 224)), transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
        ])
        x = tfm(Image.open(io.BytesIO(image_bytes)).convert("RGB")).unsqueeze(0)
        with torch.no_grad():
            prob = torch.softmax(self.accident_cnn(x), dim=1)[0, 0].item()
        return round(prob, 3)

    # ------------------------------------------------------------------ ANN
    def assess(self, detections: dict, zone_stats: dict,
               rain: bool = False) -> dict:
        feats = extract_features(detections, zone_stats=zone_stats, rain=rain)
        x = torch.tensor((feats - self.mu) / self.sd).unsqueeze(0).float()
        with torch.no_grad():
            self.severity_net.eval()
            out = self.severity_net(x)
        sev = float(out["severity"][0])
        resp = bool(torch.sigmoid(out["response_logit"])[0] > 0.5)
        prio = PRIORITY_CLASSES[int(out["priority_logits"].argmax(1)[0])]
        return {"severity": round(sev, 1), "response_needed": resp,
                "priority": prio, "features": feats.tolist()}

    # ----------------------------------------------------------------- demo
    def _demo_detections(self) -> dict:
        """Synthetic but realistic detections for demo mode / missing models."""
        scenario = random.choices(
            ["normal", "congestion", "collision"], weights=[0.4, 0.3, 0.3]
        )[0]
        n = {"normal": 4, "congestion": 10, "collision": 6}[scenario]
        classes = ["car", "motorcycle", "autorickshaw", "truck", "person", "bus"]
        boxes = []
        for k in range(n):
            x, y = random.uniform(0, 560), random.uniform(100, 380)
            w, h = random.uniform(40, 120), random.uniform(30, 90)
            # collision scenes: guarantee a heavy vehicle + two-wheelers so the
            # ANN's learned interactions (rain x heavy, 2W x collision) engage
            if scenario == "collision":
                cls = "truck" if k == 0 else ("motorcycle" if k <= 2
                                              else random.choice(classes))
            else:
                cls = random.choice(classes)
            boxes.append({"cls": cls,
                          "conf": round(random.uniform(0.55, 0.95), 3),
                          "xyxy": [round(x, 1), round(y, 1),
                                   round(x + w, 1), round(y + h, 1)]})
        collision = round(random.uniform(0.72, 0.97), 3) if scenario == "collision" \
            else round(random.uniform(0.0, 0.25), 3)
        return {"boxes": boxes, "collision_conf": collision,
                "pothole_conf": round(random.uniform(0, 0.4), 3),
                "img_size": [640, 480], "demo_scenario": scenario}


def _iou(a: list[float], b: list[float]) -> float:
    x1, y1 = max(a[0], b[0]), max(a[1], b[1])
    x2, y2 = min(a[2], b[2]), min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    if inter == 0:
        return 0.0
    area = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter
    return inter / area
