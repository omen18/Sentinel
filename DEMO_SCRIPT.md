# Sentinel — 90-second demo video script

Record at 1080p, dark room, dashboard fullscreen. Screen-record + voiceover.
Total: ~90s. No cuts inside steps 3-5 — the unbroken loop IS the demo.

| t | On screen | Voiceover |
|---|---|---|
| 0-8s | Dashboard, cursor circles the model-status chips | "This is Sentinel — a road-incident intelligence platform. Three model tiers: a YOLOv8 fine-tuned on the Indian Driving Dataset, a from-scratch accident CNN, and a multi-head neural network that scores severity." |
| 8-20s | Upload a real dashcam frame → boxes appear | "Live perception: my fine-tuned detector picks out vehicles — including autorickshaws, which COCO models can't see." |
| 20-40s | Click **Simulate incident** (collision) — point at severity gauge, then dispatch log as Analyst lines print | "Detections plus context feed my SeverityNet — a multi-head ANN scoring severity, response need, and priority. Those scores go to a team of AI agents. Watch the Analyst pull this zone's history and confirm." |
| 40-60s | Dispatcher line prints; camera follows the amber A* route animating on the zone grid; unit flips to ENGAGED | "The Dispatcher runs A-star over the city graph and rolls the nearest free unit — six-minute ETA. If two incidents compete for one ambulance, the ANN's priority head arbitrates." |
| 60-75s | Incident card appears with narrative; type in console: "summarize today's confirmed collisions" → answer streams | "Every incident is persisted. The Reporter agent answers natural-language questions over the full history — retrieval-augmented, grounded in real records." |
| 75-90s | Zoom out to full dashboard, several hot zones pulsing | "CNN perception, ANN risk assessment, agentic dispatch, explainable reports — one autonomous loop. Sentinel. Code on GitHub, link below." |

Tips: run 2-3 demo incidents before recording so the incident feed isn't empty;
set ANTHROPIC_API_KEY so narratives are LLM-written; release units between takes
(`curl -X POST localhost:8000/api/units/PAT-01/release`).
