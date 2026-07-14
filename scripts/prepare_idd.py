"""Convert IDD Detection (Pascal-VOC XML) annotations to YOLO format.

Usage:
    python scripts/prepare_idd.py --idd-root data/idd --out data/idd_yolo [--val-split 0.15]

Produces:
    data/idd_yolo/images/{train,val}/*.jpg
    data/idd_yolo/labels/{train,val}/*.txt
    data/idd_yolo/data.yaml   (ready for ultralytics)
"""
import argparse
import random
import shutil
import xml.etree.ElementTree as ET
from pathlib import Path

CLASSES = [
    "car", "motorcycle", "rider", "person", "autorickshaw",
    "truck", "bus", "bicycle", "animal",
]
CLASS_TO_ID = {c: i for i, c in enumerate(CLASSES)}


def voc_to_yolo_line(obj, img_w, img_h):
    name = obj.findtext("name", "").strip().lower()
    if name not in CLASS_TO_ID:
        return None
    b = obj.find("bndbox")
    xmin, ymin = float(b.findtext("xmin")), float(b.findtext("ymin"))
    xmax, ymax = float(b.findtext("xmax")), float(b.findtext("ymax"))
    # clamp + normalize
    xmin, xmax = max(0, xmin), min(img_w, xmax)
    ymin, ymax = max(0, ymin), min(img_h, ymax)
    if xmax <= xmin or ymax <= ymin:
        return None
    cx = (xmin + xmax) / 2 / img_w
    cy = (ymin + ymax) / 2 / img_h
    w = (xmax - xmin) / img_w
    h = (ymax - ymin) / img_h
    return f"{CLASS_TO_ID[name]} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--idd-root", required=True)
    ap.add_argument("--out", default="data/idd_yolo")
    ap.add_argument("--val-split", type=float, default=0.15)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    root, out = Path(args.idd_root), Path(args.out)
    xmls = sorted(root.rglob("Annotations/**/*.xml")) or sorted(root.rglob("*.xml"))
    if not xmls:
        raise SystemExit(f"No XML annotations found under {root}")

    random.seed(args.seed)
    random.shuffle(xmls)
    n_val = int(len(xmls) * args.val_split)
    splits = {"val": xmls[:n_val], "train": xmls[n_val:]}

    kept, skipped = 0, 0
    for split, files in splits.items():
        (out / f"images/{split}").mkdir(parents=True, exist_ok=True)
        (out / f"labels/{split}").mkdir(parents=True, exist_ok=True)
        for xml_path in files:
            tree = ET.parse(xml_path)
            r = tree.getroot()
            fname = r.findtext("filename")
            size = r.find("size")
            img_w = int(float(size.findtext("width")))
            img_h = int(float(size.findtext("height")))
            # IDD mirrors JPEGImages/<subdirs>/<file>; search for it
            candidates = list(root.rglob(f"JPEGImages/**/{fname}")) or list(root.rglob(fname))
            if not candidates:
                skipped += 1
                continue
            lines = [l for o in r.findall("object")
                     if (l := voc_to_yolo_line(o, img_w, img_h))]
            if not lines:
                skipped += 1
                continue
            stem = xml_path.stem
            shutil.copy(candidates[0], out / f"images/{split}/{stem}{candidates[0].suffix}")
            (out / f"labels/{split}/{stem}.txt").write_text("\n".join(lines))
            kept += 1

    yaml = (
        f"path: {out.resolve()}\n"
        "train: images/train\nval: images/val\n"
        f"names:\n" + "\n".join(f"  {i}: {c}" for i, c in enumerate(CLASSES)) + "\n"
    )
    (out / "data.yaml").write_text(yaml)
    print(f"Done. kept={kept} skipped={skipped}. data.yaml written to {out/'data.yaml'}")


if __name__ == "__main__":
    main()
