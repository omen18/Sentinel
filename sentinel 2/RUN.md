# Running Sentinel

## 1. Install
```bash
pip install -r requirements.txt        # (--break-system-packages on Debian/Ubuntu)
```

## 2. Start
```bash
uvicorn backend.app.main:app --reload
# open http://localhost:8000
```
Works immediately, out of the box:
- YOLOv8n COCO auto-downloads for real image detection (upgrade path below)
- SeverityNet ships pre-trained (models/ann/weights_severity_net.pt)
- Agents run in heuristic mode; the full graph, tools, A* dispatch and RAG all work

## 3. Turn on LLM agents (recommended)
```bash
export ANTHROPIC_API_KEY=sk-ant-...
uvicorn backend.app.main:app --reload
```
Analyst verdicts, Reporter narratives, and the console's answers now come from
Claude, grounded in tool results. /health shows "llm": "anthropic".

## 4. Demo flow (what to record for the video)
1. Open the dashboard, point at the model-status chips.
2. Click **Simulate incident** a few times — watch the dispatch log: Analyst pulls
   zone history, confirms; Dispatcher runs A* and rolls a unit; the route animates
   on the zone grid; the unit flips to ENGAGED.
3. Upload a real dashcam frame (or start the webcam) — real YOLO boxes appear.
4. Ask the console: "summarize confirmed collisions" — RAG over the store.
5. `curl localhost:8000/api/units/PAT-01/release -X POST` to free units.

## 5. Upgrade the models (your training work)
| You train | Drop weights at | System auto-upgrades to |
|---|---|---|
| YOLOv8 on IDD (`training/yolo/`) | `runs/sentinel/yolov8s_idd/weights/best.pt` | Indian-road classes incl. autorickshaw |
| AccidentCNN (`training/accident_cnn/`) | `weights/accident_cnn_best.pt` | learned collision probability |
| SeverityNet on real logs | `models/ann/weights_severity_net.pt` | real-data risk scores |

`/health` always tells you which tier each model is running at.

## 6. Video analysis
```bash
curl -X POST localhost:8000/analyze/video -F "file=@dashcam.mp4"
```
