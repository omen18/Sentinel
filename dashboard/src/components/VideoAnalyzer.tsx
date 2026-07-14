"use client";

import React, { useRef, useState, useEffect } from "react";
import { useSentinelStore } from "../store/useSentinelStore";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Button } from "./ui/button";
import { Camera, Upload, AlertCircle, Play, Square } from "lucide-react";

export function VideoAnalyzer() {
  const activeIncident = useSentinelStore((state) => state.activeIncident);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [webcamActive, setWebcamActive] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const currentImageRef = useRef<HTMLImageElement | null>(null);

  // Redraw canvas whenever activeIncident or image changes
  useEffect(() => {
    drawCanvas();
  }, [activeIncident]);

  const drawCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const detections = activeIncident?.detections;
    const [w, h] = detections?.img_size || [640, 480];
    
    // Set matching dimensions
    canvas.width = w;
    canvas.height = h;

    // Draw background (either uploaded image or cyber-grid)
    if (currentImageRef.current) {
      ctx.drawImage(currentImageRef.current, 0, 0, w, h);
    } else {
      // Stylized digital road grid background
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, "#0c0f15");
      grad.addColorStop(0.6, "#0f1219");
      grad.addColorStop(1, "#161b25");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);

      // Digital grid lines
      ctx.strokeStyle = "rgba(189, 147, 249, 0.05)";
      ctx.lineWidth = 1;
      for (let i = 0; i < w; i += 40) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i, h);
        ctx.stroke();
      }
      for (let i = 0; i < h; i += 40) {
        ctx.beginPath();
        ctx.moveTo(0, i);
        ctx.lineTo(w, i);
        ctx.stroke();
      }

      // Cyber lane marker
      ctx.strokeStyle = "rgba(255, 121, 198, 0.1)";
      ctx.lineWidth = 2;
      ctx.setLineDash([15, 15]);
      ctx.beginPath();
      ctx.moveTo(w * 0.5, h * 0.3);
      ctx.lineTo(w * 0.5, h);
      ctx.stroke();
      ctx.setLineDash([]);

      // Tactical reticle overlay
      ctx.strokeStyle = "rgba(139, 233, 253, 0.15)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(w * 0.25, h * 0.25, w * 0.5, h * 0.5);
      
      ctx.fillStyle = "rgba(98, 114, 164, 0.3)";
      ctx.font = "10px monospace";
      ctx.fillText("TACTICAL FEED OFFLINE", w * 0.42, h * 0.5);
    }

    // Draw YOLO boxes if available
    if (detections?.boxes) {
      const isConfirmed = detections.collision_conf > 0.5;
      const color = isConfirmed ? "#ff5555" : "#ffb86c"; // Red for collision risk, Orange for standard

      detections.boxes.forEach((box) => {
        const [x1, y1, x2, y2] = box.xyxy;
        const boxWidth = x2 - x1;
        const boxHeight = y2 - y1;

        // Bounding box glow
        ctx.shadowColor = color;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(x1, y1, boxWidth, boxHeight);
        ctx.shadowBlur = 0; // reset glow

        // Box label tag
        ctx.font = "bold 11px Inter, sans-serif";
        const label = `${box.cls} ${(box.conf * 100).toFixed(0)}%`;
        const textWidth = ctx.measureText(label).width;

        // Tag background
        ctx.fillStyle = "rgba(10, 10, 15, 0.85)";
        ctx.fillRect(x1 - 1, y1 - 18, textWidth + 10, 18);

        // Tag border top/left
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.strokeRect(x1 - 1, y1 - 18, textWidth + 10, 18);

        // Label Text
        ctx.fillStyle = color;
        ctx.fillText(label, x1 + 4, y1 - 5);
      });

      // Draw collision warning if conf high
      if (isConfirmed) {
        ctx.fillStyle = "rgba(255, 85, 85, 0.15)";
        ctx.fillRect(10, 10, w - 20, 35);
        ctx.strokeStyle = "#ff5555";
        ctx.lineWidth = 2;
        ctx.strokeRect(10, 10, w - 20, 35);

        ctx.fillStyle = "#ff5555";
        ctx.font = "bold 12px monospace";
        ctx.fillText(`[ COLLISION COLLATERAL DETECTED: ${(detections.collision_conf * 100).toFixed(0)}% CONFIDENCE ]`, 20, 32);
      }
    }
  };

  // Upload frame
  const handleUpload = async (file: File) => {
    if (!file) return;
    setAnalyzing(true);

    // Create local image bitmap to draw on canvas
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = async () => {
      currentImageRef.current = img;
      
      const fd = new FormData();
      fd.append("file", file);

      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
        const res = await fetch(`${apiUrl}/analyze/frame`, {
          method: "POST",
          body: fd,
        });
        if (!res.ok) {
          throw new Error("Analysis failed");
        }
        await res.json(); // returns analysis, websocket keeps state in sync
      } catch (err) {
        console.error("Frame analysis failed:", err);
      } finally {
        setAnalyzing(false);
      }
    };
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleUpload(e.target.files[0]);
    }
  };

  // Drag and drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleUpload(e.dataTransfer.files[0]);
    }
  };

  // Webcam operations
  const startWebcam = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setWebcamActive(true);

      // Periodically capture frames and upload
      const captureCanvas = document.createElement("canvas");
      captureCanvas.width = 640;
      captureCanvas.height = 480;
      const captureCtx = captureCanvas.getContext("2d");

      intervalRef.current = setInterval(() => {
        if (videoRef.current && captureCtx) {
          captureCtx.drawImage(videoRef.current, 0, 0, 640, 480);
          
          // Set as active local image bitmap
          const localImg = new Image();
          localImg.src = captureCanvas.toDataURL("image/jpeg");
          localImg.onload = () => {
            currentImageRef.current = localImg;
          };

          captureCanvas.toBlob(async (blob) => {
            if (blob) {
              const fd = new FormData();
              fd.append("file", blob, "webcam_frame.jpg");
              try {
                const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
                await fetch(`${apiUrl}/analyze/frame`, {
                  method: "POST",
                  body: fd,
                });
              } catch (err) {
                console.error("Webcam frame post error:", err);
              }
            }
          }, "image/jpeg", 0.85);
        }
      }, 2500); // 2.5 second capture cycle
    } catch (err) {
      console.error("Failed to access webcam:", err);
      alert("Could not access camera feed. Check permissions.");
    }
  };

  const stopWebcam = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setWebcamActive(false);
  };

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <Card className="bg-[#0f101a] border-white/5 flex flex-col h-[340px]">
      <CardHeader className="p-3 pb-0 flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xs uppercase font-mono text-[#6272a4] flex items-center gap-1.5">
          <Camera className="w-3.5 h-3.5 text-[#bd93f9]" />
          Visual Perception Stream (YOLOv8 + AccidentCNN)
        </CardTitle>
      </CardHeader>
      
      <CardContent className="p-3 flex-grow flex flex-col gap-2 min-h-0">
        {/* Canvas Display Screen */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`flex-grow relative border rounded overflow-hidden flex items-center justify-center bg-black/40 min-h-0 ${
            dragActive ? "border-[#bd93f9]" : "border-white/5"
          }`}
        >
          <canvas
            ref={canvasRef}
            className="w-full h-full object-contain"
          />

          {/* Hidden video element for streaming */}
          <video
            ref={videoRef}
            className="hidden"
            playsInline
            muted
          />

          {/* Loader */}
          {analyzing && (
            <div className="absolute inset-0 bg-[#0a0a0f]/80 flex flex-col items-center justify-center gap-2 font-mono text-xs">
              <div className="w-4 h-4 border-2 border-[#bd93f9] border-t-transparent rounded-full animate-spin" />
              <span className="text-[#bd93f9]">ANALYZING FRAME...</span>
            </div>
          )}

          {/* Drag Overlay text */}
          {!currentImageRef.current && !webcamActive && !analyzing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center pointer-events-none text-xs font-mono text-[#6272a4]">
              <Upload className="w-8 h-8 mb-2 text-white/10" />
              <span>Drag & Drop Dashcam Frame here or click upload</span>
            </div>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex gap-2 font-mono text-xs">
          <Button
            size="sm"
            onClick={webcamActive ? stopWebcam : startWebcam}
            className={`flex-grow h-8 bg-transparent hover:bg-white/5 text-[#f8f8f2] border rounded cursor-pointer ${
              webcamActive ? "border-[#ff5555] text-[#ff5555]" : "border-white/10"
            }`}
          >
            {webcamActive ? (
              <>
                <Square className="w-3.5 h-3.5 mr-1.5 fill-current" /> Stop Feed
              </>
            ) : (
              <>
                <Camera className="w-3.5 h-3.5 mr-1.5" /> Start Webcam
              </>
            )}
          </Button>

          <label className="flex-grow h-8 border border-white/10 rounded hover:bg-white/5 text-center flex items-center justify-center cursor-pointer gap-1.5 text-[#f8f8f2]">
            <Upload className="w-3.5 h-3.5" />
            Upload Frame
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </label>
        </div>
      </CardContent>
    </Card>
  );
}
export default VideoAnalyzer;
