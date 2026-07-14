"""Fine-tune YOLOv8 on IDD (converted with scripts/prepare_idd.py).

Run on Colab/Kaggle T4:
    pip install ultralytics
    python training/yolo/train_yolo.py --data data/idd_yolo/data.yaml --epochs 50

Interview notes to log while this runs (put them in notebooks/yolo_notes.md):
- Why yolov8s not yolov8x: real-time inference target (~30 FPS on T4), small deploy size.
- Transfer learning: COCO-pretrained backbone, fine-tuned head on Indian classes
  (autorickshaw, animal, rider — absent/rare in COCO).
- Augmentation: mosaic + HSV shift approximates Indian lighting/dust variance.
"""
import argparse
from ultralytics import YOLO


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/idd_yolo/data.yaml")
    ap.add_argument("--model", default="yolov8s.pt")
    ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--batch", type=int, default=16)
    args = ap.parse_args()

    model = YOLO(args.model)  # COCO-pretrained
    model.train(
        data=args.data,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        patience=10,
        project="runs/sentinel",
        name="yolov8s_idd",
        # augmentation tuned for road scenes
        mosaic=1.0, hsv_h=0.015, hsv_s=0.7, hsv_v=0.4, degrees=5.0,
    )
    metrics = model.val()
    print("mAP50:", metrics.box.map50, "| mAP50-95:", metrics.box.map)
    # -> paste these into README results table


if __name__ == "__main__":
    main()
