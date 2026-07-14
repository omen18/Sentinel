"""Train AccidentCNN on data/accident/{train,val}/{accident,normal}/*.jpg

    python training/accident_cnn/train.py --data data/accident --epochs 25

Logs per-epoch loss/F1 to training/accident_cnn/history.csv (plot it in a notebook
for the README) and saves best weights to weights/accident_cnn_best.pt
"""
import argparse
import csv
from pathlib import Path

import torch
import torch.nn as nn
from torch.utils.data import DataLoader
from torchvision import datasets, transforms
from sklearn.metrics import f1_score, confusion_matrix

from model import AccidentCNN

TRAIN_TFMS = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.RandomHorizontalFlip(),
    transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])
VAL_TFMS = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225]),
])


@torch.no_grad()
def evaluate(model, loader, device):
    model.eval()
    ys, ps = [], []
    for x, y in loader:
        logits = model(x.to(device))
        ps += logits.argmax(1).cpu().tolist()
        ys += y.tolist()
    return f1_score(ys, ps), confusion_matrix(ys, ps)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="data/accident")
    ap.add_argument("--epochs", type=int, default=25)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--lr", type=float, default=3e-4)
    args = ap.parse_args()

    device = "cuda" if torch.cuda.is_available() else "cpu"
    train_ds = datasets.ImageFolder(f"{args.data}/train", TRAIN_TFMS)
    val_ds = datasets.ImageFolder(f"{args.data}/val", VAL_TFMS)
    train_dl = DataLoader(train_ds, batch_size=args.batch, shuffle=True, num_workers=2)
    val_dl = DataLoader(val_ds, batch_size=args.batch, num_workers=2)

    # class imbalance -> weighted loss (interview point: why not just oversample?)
    counts = torch.bincount(torch.tensor(train_ds.targets))
    weights = (counts.sum() / (2.0 * counts)).to(device)
    criterion = nn.CrossEntropyLoss(weight=weights)

    model = AccidentCNN().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.epochs)

    Path("weights").mkdir(exist_ok=True)
    hist_path = Path(__file__).parent / "history.csv"
    best_f1 = 0.0
    with open(hist_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["epoch", "train_loss", "val_f1"])
        for epoch in range(1, args.epochs + 1):
            model.train()
            total = 0.0
            for x, y in train_dl:
                x, y = x.to(device), y.to(device)
                opt.zero_grad()
                loss = criterion(model(x), y)
                loss.backward()
                opt.step()
                total += loss.item() * x.size(0)
            sched.step()
            f1, cm = evaluate(model, val_dl, device)
            avg = total / len(train_ds)
            writer.writerow([epoch, f"{avg:.4f}", f"{f1:.4f}"])
            print(f"epoch {epoch:02d} | loss {avg:.4f} | val F1 {f1:.4f}\n{cm}")
            if f1 > best_f1:
                best_f1 = f1
                torch.save(model.state_dict(), "weights/accident_cnn_best.pt")
    print(f"best val F1: {best_f1:.4f} -> README results table")


if __name__ == "__main__":
    main()
