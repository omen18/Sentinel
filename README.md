# 🛰️ Sentinel — Real-Time AI Road Incident Intelligence Platform

India loses ~1.7 lakh (170,000) people to road accidents every year. The single biggest determinant of survival is emergency response time during the "golden hour." Sentinel exists to shrink that window by automating incident detection, risk triage, and dispatch decisions.

> CNN-powered perception · Multi-head ANN risk assessment · Multi-agent GenAI dispatch · Real-time dashboard

![demo](assets/demo.gif) <!-- Record this in Week 8 -->

---

## 🧠 Architecture

```
 Video frames
     │
     ▼
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────────┐
│  PERCEPTION      │     │  RISK ASSESSMENT      │     │  AGENT LAYER (LangGraph) │
│  YOLOv8 (IDD)    │────▶│  Multi-head ANN       │────▶│  Analyst → Dispatcher    │
│  Accident CNN    │     │  severity / response  │     │        → Reporter        │
│  (from scratch)  │     │  / priority           │     │  Tools: RAG, A★ dispatch │
└─────────────────┘     └──────────────────────┘     └────────────┬────────────┘
                                                                   │
                                                                   ▼
                                                    FastAPI + WebSockets → Next.js dashboard
```

**Why each piece exists (interview answers, short version):**
- **CNN** — vision requires it; YOLOv8 fine-tuned on Indian roads (IDD), plus a
  from-scratch accident classifier to prove architecture-level understanding.
- **ANN** — learns feature interactions between vision confidence and context
  (time, weather, zone history). Benchmarked against LogReg and XGBoost (table below).
  Multi-head design: shared representation → severity (regression), response-needed
  (binary), priority (multiclass).
- **Agents** — one prompt can't dispatch. Separation of concerns + tool use +
  arbitration under resource conflict, grounded in the ANN's priority output.

## 📊 Results

| Model | Task | Metric | Score |
|---|---|---|---|
| YOLOv8s (fine-tuned, IDD) | Detection | mAP@50 | **0.552** (vs 0.384 baseline COCO) |
| AccidentCNN (ours) | Frame classification | F1 | **0.865** (val F1 on CCTV data) |
| SeverityNet (ours) | Severity regression | MAE | **4.84** (synthetic bootstrap) |
| SeverityNet vs XGBoost | Response-needed | AUC | **0.992** vs 0.994 |
| SeverityNet vs LogReg | Response-needed | AUC | **0.992** vs 0.986 |

## 🌟 What's Novel? (Hackathon Jury Highlights)

- **ML inside the Decision Loop (Arbitration Head):** Unlike standard detection apps that just draw bounding boxes, Sentinel places a custom multi-head neural network inside the decision loop. If two incidents compete for a single ambulance, Sentinel's neural priority head arbitrates the dispatch based on calculated survival risk, not just proximity.
- **Agentic GenAI Dispatch Verification:** A team of AI agents (Analyst, Dispatcher, Reporter) collaborate using LangGraph to analyze incident history, run A* routing over a grid network, and generate explainable dispatch logs.
- **API-Free Speed Limit Detection (Drive Mode):** A local, responsive mobile HUD utilizing Leaflet and OpenStreetMap coordinates. It queries Overpass API dynamically to auto-detect speed limits without commercial, paid APIs (e.g. Google Roads API).

Training curves, confusion matrices → `notebooks/`

## 🗂️ Repo layout

```
data/                  # dataset download + prep instructions (data/README.md)
scripts/               # IDD → YOLO format conversion
training/yolo/         # YOLOv8 fine-tuning config + script
training/accident_cnn/ # from-scratch CNN: model, training loop
models/ann/            # multi-head SeverityNet + baseline benchmark
agents/                # LangGraph: Analyst / Dispatcher / Reporter + tools
backend/               # FastAPI inference server + WebSocket streaming
dashboard/             # Next.js real-time dashboard (Week 6–7)
notebooks/             # training runs, metrics, curves
```

## ✅ Works out of the box

`pip install -r requirements.txt && uvicorn backend.app.main:app` → full system at
http://localhost:8000 — see **RUN.md**. Pretrained YOLO + shipped SeverityNet weights +
heuristic-mode agents mean nothing is stubbed; your trained weights upgrade each tier
automatically (paths in RUN.md).

*Honest note on the ANN benchmark: on the synthetic bootstrap, XGBoost edges SeverityNet
(0.994 vs 0.992 AUC) — expected on mostly-additive synthetic data. The ANN's case is the
multi-head shared representation and learned interaction terms as real logged incidents
replace synthetic rows. Priority-head macro-F1 (0.55) is the current weak spot; tracked
as a known limitation.*

## 🚀 Quickstart

```bash
pip install -r requirements.txt
# 1. Get data:            see data/README.md
# 2. Prepare IDD:         python scripts/prepare_idd.py --idd-root data/idd
# 3. Fine-tune YOLO:      python training/yolo/train_yolo.py
# 4. Train accident CNN:  python training/accident_cnn/train.py
# 5. Train SeverityNet:   python models/ann/train_ann.py
# 6. Run backend:         uvicorn backend.app.main:app --reload
```

## 🗺️ Roadmap

- [x] Week 1–2 — YOLOv8 fine-tune on IDD, accident CNN, metrics
- [ ] Week 3 — SeverityNet (multi-head ANN) + XGBoost/LogReg benchmark
- [ ] Week 4–5 — LangGraph agents, tools, pgvector RAG
- [ ] Week 6–7 — FastAPI + WebSockets, Next.js dashboard
- [ ] Week 8 — README paper-ification, demo video, deploy
- [ ] **Phase 2 (research extensions):** GNN congestion propagation ·
      DQN traffic-signal optimization · self-improving agent loop over false positives

## ⚖️ Limitations

Honest section — fill in as you learn: dataset domain gap, night/rain performance,
false-positive rate on near-misses, single-camera scope, LLM latency on report generation.

## 📜 License

Yash Raj Sharan
