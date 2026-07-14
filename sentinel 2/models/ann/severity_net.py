"""SeverityNet — multi-head feedforward ANN. The 'proper use of ANN' centerpiece.

Input (15 features, see FEATURES): CNN outputs + temporal/spatial context.
Shared trunk -> three task heads:
    severity  : regression, 0-100
    response  : binary   — emergency response needed?
    priority  : 3-class  — LOW / MEDIUM / HIGH dispatch priority

Interview talking points:
- Multi-task learning: shared trunk learns a common risk representation;
  heads specialize. Combined loss = MSE + BCE + CE (weighted).
- Why ANN over XGBoost here: learned interactions between vision confidence
  and context (e.g. low collision_conf AT NIGHT in a high-history zone should
  score differently than the same confidence at noon) + a single model serving
  three coupled outputs the agents consume as one schema.
- Benchmarks against LogReg/XGBoost live in train_ann.py — report them honestly.
"""
import torch
import torch.nn as nn

FEATURES = [
    "vehicle_count", "collision_conf", "pothole_conf", "person_count",
    "two_wheeler_ratio", "heavy_vehicle_flag", "avg_det_confidence",
    "hour_sin", "hour_cos", "is_weekend", "is_night",
    "rain_flag", "road_type", "zone_incident_rate", "zone_traffic_density",
]
PRIORITY_CLASSES = ["LOW", "MEDIUM", "HIGH"]


class SeverityNet(nn.Module):
    def __init__(self, in_dim: int = len(FEATURES)):
        super().__init__()
        self.trunk = nn.Sequential(
            nn.Linear(in_dim, 64), nn.BatchNorm1d(64), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(64, 32),     nn.BatchNorm1d(32), nn.ReLU(), nn.Dropout(0.2),
            nn.Linear(32, 16),     nn.ReLU(),
        )
        self.severity_head = nn.Linear(16, 1)   # regression (scale to 0-100 outside)
        self.response_head = nn.Linear(16, 1)   # binary logit
        self.priority_head = nn.Linear(16, 3)   # multiclass logits

    def forward(self, x):
        z = self.trunk(x)
        return {
            "severity": torch.sigmoid(self.severity_head(z)).squeeze(-1) * 100.0,
            "response_logit": self.response_head(z).squeeze(-1),
            "priority_logits": self.priority_head(z),
        }


def multitask_loss(out, y_sev, y_resp, y_prio, w=(1.0, 1.0, 1.0)):
    mse = nn.functional.mse_loss(out["severity"], y_sev)
    bce = nn.functional.binary_cross_entropy_with_logits(out["response_logit"], y_resp)
    ce = nn.functional.cross_entropy(out["priority_logits"], y_prio)
    return w[0] * mse / 100.0 + w[1] * bce + w[2] * ce, {"mse": mse.item(), "bce": bce.item(), "ce": ce.item()}
