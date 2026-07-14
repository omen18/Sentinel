# Week 1 Mission — first bounding boxes by Sunday night

## Saturday
- [ ] Register + start IDD Detection download (data/README.md) — it's big, start it FIRST
- [ ] While it downloads: create Kaggle/Colab notebook, verify GPU (`!nvidia-smi`)
- [ ] `pip install ultralytics` and run YOLOv8s COCO inference on ANY Indian road
      YouTube clip frame — sanity-check the toolchain works end to end
- [ ] Push this repo to GitHub (public), first commit

## Sunday
- [ ] `python scripts/prepare_idd.py --idd-root data/idd --out data/idd_yolo`
- [ ] Kick off `python training/yolo/train_yolo.py --epochs 50` (T4: ~3-5h on a subset —
      use 5-8k images for the first run, scale later)
- [ ] While it trains: download the Kaggle accident dataset, arrange folders
      per data/README.md
- [ ] When training ends: run val, screenshot mAP + a predicted image with boxes
      -> post it. That screenshot is your momentum.

## Log as you go (notebooks/yolo_notes.md)
Every decision + why: model size, epochs, augmentation, classes kept.
This file becomes your interview prep.
