# Datasets

## 1. IDD — Indian Driving Dataset (for YOLO fine-tuning)

- Register (free, academic) at: https://idd.insaan.iiit.ac.in/
- Download **IDD Detection** (~22 GB full; a subset is fine for v1 — even 5–8k images works).
- Extract to `data/idd/` so you have:
  ```
  data/idd/JPEGImages/...
  data/idd/Annotations/...   (Pascal-VOC style XML)
  ```
- Convert to YOLO format:
  ```bash
  python scripts/prepare_idd.py --idd-root data/idd --out data/idd_yolo
  ```

Classes we keep for v1 (edit in `scripts/prepare_idd.py`):
`car, motorcycle, rider, person, autorickshaw, truck, bus, bicycle, animal`

## 2. Accident classification data (for the from-scratch CNN)

Pick one to start (Kaggle account needed):
- **Accident Detection From CCTV Footage** — kaggle.com/datasets/ckay16/accident-detection-from-cctv-footage
- **CADP** (Car Accident Detection and Prediction) — search "CADP dataset" (video; extract frames)

Layout expected by `training/accident_cnn/train.py`:
```
data/accident/
  train/accident/*.jpg
  train/normal/*.jpg
  val/accident/*.jpg
  val/normal/*.jpg
```

Tip: also mine **hard negatives** — traffic jams, close-following vehicles, rain frames —
and put them in `normal/`. This is what keeps your false-positive rate honest and gives
you a great interview story about class imbalance and hard-negative mining.

## 3. Tabular features for SeverityNet

Generated, not downloaded — `models/ann/train_ann.py` includes a synthetic-bootstrap
generator so you can train/benchmark the ANN pipeline on day one, then progressively
replace synthetic rows with real rows logged from your own CNN inference runs
(the backend logs every detection to `data/incidents.parquet`).
