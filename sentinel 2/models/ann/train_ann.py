"""Train SeverityNet + benchmark against LogisticRegression and XGBoost.

    python models/ann/train_ann.py --n 8000 --epochs 60

Starts on a synthetic bootstrap dataset (rule-based generator with noise +
feature interactions) so the full pipeline works on day one. As the backend
logs real detections to data/incidents.parquet, pass --real to mix them in.

The benchmark table it prints goes straight into the README. If XGBoost wins
on the binary task at small data sizes — REPORT IT. Then show the crossover
as data grows. That honesty is an interview weapon, not a weakness.
"""
import argparse

import numpy as np
import torch
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, mean_absolute_error, f1_score
from sklearn.model_selection import train_test_split

from severity_net import SeverityNet, multitask_loss, FEATURES


def synth(n, seed=42):
    """Synthetic incidents with deliberate feature INTERACTIONS the ANN should learn."""
    rng = np.random.default_rng(seed)
    X = np.zeros((n, len(FEATURES)), dtype=np.float32)
    X[:, 0] = rng.poisson(6, n)                      # vehicle_count
    X[:, 1] = rng.beta(2, 5, n)                      # collision_conf
    X[:, 2] = rng.beta(2, 8, n)                      # pothole_conf
    X[:, 3] = rng.poisson(2, n)                      # person_count
    X[:, 4] = rng.uniform(0, 1, n)                   # two_wheeler_ratio
    X[:, 5] = rng.binomial(1, 0.25, n)               # heavy_vehicle_flag
    X[:, 6] = rng.uniform(0.3, 0.95, n)              # avg_det_confidence
    hour = rng.integers(0, 24, n)
    X[:, 7] = np.sin(2 * np.pi * hour / 24)          # hour_sin
    X[:, 8] = np.cos(2 * np.pi * hour / 24)          # hour_cos
    X[:, 9] = rng.binomial(1, 2 / 7, n)              # is_weekend
    X[:, 10] = ((hour < 6) | (hour > 20)).astype(float)  # is_night
    X[:, 11] = rng.binomial(1, 0.2, n)               # rain_flag
    X[:, 12] = rng.integers(0, 3, n)                 # road_type
    X[:, 13] = rng.beta(2, 6, n)                     # zone_incident_rate
    X[:, 14] = rng.uniform(0, 1, n)                  # zone_traffic_density

    # ground-truth severity with INTERACTIONS (night amplifies collision; rain x heavy)
    sev = (
        45 * X[:, 1]
        + 25 * X[:, 1] * X[:, 10]                    # collision worse at night
        + 12 * X[:, 11] * X[:, 5]                    # rain x heavy vehicle
        + 8 * X[:, 4] * X[:, 1]                      # two-wheelers in collisions
        + 10 * X[:, 13]
        + rng.normal(0, 6, n)
    ).clip(0, 100).astype(np.float32)
    resp = (sev > 55).astype(np.float32)
    prio = np.digitize(sev, [35, 65]).astype(np.int64)  # 0/1/2
    return X, sev, resp, prio


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=8000)
    ap.add_argument("--epochs", type=int, default=60)
    args = ap.parse_args()

    X, sev, resp, prio = synth(args.n)
    Xtr, Xte, str_, ste, rtr, rte, ptr, pte = train_test_split(
        X, sev, resp, prio, test_size=0.2, random_state=42
    )
    mu, sd = Xtr.mean(0), Xtr.std(0) + 1e-8
    Xtr_n, Xte_n = (Xtr - mu) / sd, (Xte - mu) / sd

    # ---- baselines (binary response task) ----
    lr = LogisticRegression(max_iter=1000).fit(Xtr_n, rtr)
    lr_auc = roc_auc_score(rte, lr.predict_proba(Xte_n)[:, 1])
    try:
        from xgboost import XGBClassifier
        xgb = XGBClassifier(n_estimators=300, max_depth=5, learning_rate=0.08,
                            eval_metric="logloss").fit(Xtr, rtr)
        xgb_auc = roc_auc_score(rte, xgb.predict_proba(Xte)[:, 1])
    except ImportError:
        xgb_auc = float("nan")

    # ---- SeverityNet ----
    device = "cuda" if torch.cuda.is_available() else "cpu"
    model = SeverityNet().to(device)
    opt = torch.optim.AdamW(model.parameters(), lr=2e-3, weight_decay=1e-4)
    tXtr = torch.tensor(Xtr_n, device=device)
    tstr = torch.tensor(str_, device=device)
    trtr = torch.tensor(rtr, device=device)
    tptr = torch.tensor(ptr, device=device)
    for epoch in range(args.epochs):
        model.train()
        opt.zero_grad()
        out = model(tXtr)
        loss, parts = multitask_loss(out, tstr, trtr, tptr)
        loss.backward()
        opt.step()
        if epoch % 10 == 0:
            print(f"epoch {epoch:03d} loss {loss.item():.4f} {parts}")

    model.eval()
    with torch.no_grad():
        out = model(torch.tensor(Xte_n, device=device))
        sev_pred = out["severity"].cpu().numpy()
        resp_prob = torch.sigmoid(out["response_logit"]).cpu().numpy()
        prio_pred = out["priority_logits"].argmax(1).cpu().numpy()

    print("\n=== BENCHMARK (paste into README) ===")
    print(f"Severity MAE (ANN):            {mean_absolute_error(ste, sev_pred):.2f}")
    print(f"Response AUC — LogReg:         {lr_auc:.4f}")
    print(f"Response AUC — XGBoost:        {xgb_auc:.4f}")
    print(f"Response AUC — SeverityNet:    {roc_auc_score(rte, resp_prob):.4f}")
    print(f"Priority macro-F1 (ANN):       {f1_score(pte, prio_pred, average='macro'):.4f}")

    torch.save({"state_dict": model.state_dict(), "mu": mu, "sd": sd},
               "weights_severity_net.pt")
    print("saved -> weights_severity_net.pt")


if __name__ == "__main__":
    main()
