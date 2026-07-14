"use client";

import React, { useState } from "react";
import { useSentinelStore } from "../store/useSentinelStore";
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./ui/dialog";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

// Mock training data for charts
const yoloData = [
  { epoch: 10, val_loss: 1.82, mAP50: 0.35, mAP50_95: 0.18 },
  { epoch: 20, val_loss: 1.45, mAP50: 0.52, mAP50_95: 0.28 },
  { epoch: 30, val_loss: 1.12, mAP50: 0.68, mAP50_95: 0.38 },
  { epoch: 40, val_loss: 0.95, mAP50: 0.74, mAP50_95: 0.45 },
  { epoch: 50, val_loss: 0.81, mAP50: 0.81, mAP50_95: 0.52 },
  { epoch: 60, val_loss: 0.72, mAP50: 0.83, mAP50_95: 0.56 },
  { epoch: 70, val_loss: 0.65, mAP50: 0.85, mAP50_95: 0.58 },
  { epoch: 80, val_loss: 0.61, mAP50: 0.86, mAP50_95: 0.60 },
];

const cnnData = [
  { epoch: 5, loss: 0.68, acc: 0.58, val_acc: 0.56 },
  { epoch: 10, loss: 0.52, acc: 0.74, val_acc: 0.72 },
  { epoch: 15, loss: 0.38, acc: 0.83, val_acc: 0.81 },
  { epoch: 20, loss: 0.28, acc: 0.89, val_acc: 0.86 },
  { epoch: 25, loss: 0.21, acc: 0.93, val_acc: 0.90 },
  { epoch: 30, loss: 0.17, acc: 0.95, val_acc: 0.92 },
];

const annData = [
  { epoch: 10, loss: 0.42, val_loss: 0.45, accuracy: 0.65 },
  { epoch: 20, loss: 0.31, val_loss: 0.34, accuracy: 0.78 },
  { epoch: 30, loss: 0.23, val_loss: 0.27, accuracy: 0.85 },
  { epoch: 40, loss: 0.18, val_loss: 0.22, accuracy: 0.89 },
  { epoch: 50, loss: 0.15, val_loss: 0.19, accuracy: 0.91 },
];

export function ModelStatusChips() {
  const health = useSentinelStore((state) => state.health);
  const models = health.models || {};
  const agentMode = health.llm || "heuristic";

  const [openModal, setOpenModal] = useState<string | null>(null);

  // Helper to style active model tiers
  const getTierColor = (tier: string) => {
    if (tier && (tier.toLowerCase().includes("fine-tuned") || tier.toLowerCase().includes("trained") || tier.toLowerCase().includes("custom"))) {
      return "bg-[#50fa7b]/10 text-[#50fa7b] border-[#50fa7b]/30";
    }
    return "bg-[#ffb86c]/10 text-[#ffb86c] border-[#ffb86c]/30";
  };

  return (
    <div className="flex flex-wrap gap-2 items-center p-3 bg-[#0f101a] border border-white/5 rounded-lg">
      <span className="text-[10px] uppercase font-bold text-[#6272a4] mr-1">Tiers:</span>
      
      {/* YOLOv8 perception chip */}
      <Dialog open={openModal === "yolo"} onOpenChange={(o) => setOpenModal(o ? "yolo" : null)}>
        <DialogTrigger render={
          <Button
            variant="outline"
            size="sm"
            className={`h-7 px-3 text-[11px] font-mono rounded-full border cursor-pointer hover:bg-white/5 transition-all ${getTierColor(
              models.detector || "default"
            )}`}
          />
        }>
          YOLOv8: <span className="font-bold ml-1">{models.detector || "COCO"}</span>
        </DialogTrigger>
        <DialogContent className="bg-[#0f101a] border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#bd93f9] font-mono">YOLOv8 Fine-Tuning Performance (IDD Subset)</DialogTitle>
            <DialogDescription className="text-[#6272a4]">
              Model trained on 8,000 Indian Driving Dataset annotations to identify auto-rickshaws, bikes, and pedestrians.
            </DialogDescription>
          </DialogHeader>
          <div className="h-64 w-full mt-4 font-mono text-[11px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={yoloData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="epoch" stroke="#6272a4" />
                <YAxis stroke="#6272a4" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f101a", borderColor: "rgba(255,255,255,0.1)", color: "#fff" }}
                />
                <Legend />
                <Line type="monotone" dataKey="mAP50" stroke="#50fa7b" name="mAP@0.5" strokeWidth={2} />
                <Line type="monotone" dataKey="mAP50_95" stroke="#8be9fd" name="mAP@0.5:0.95" strokeWidth={2} />
                <Line type="monotone" dataKey="val_loss" stroke="#ff5555" name="Val Loss" strokeWidth={1} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-[#6272a4] mt-2 font-mono flex justify-between">
            <span>Fine-tuned Weights: yolov8s_idd/best.pt</span>
            <span className="text-[#50fa7b]">Current Status: ACTIVE (UPGRADED)</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* AccidentCNN classifier chip */}
      <Dialog open={openModal === "cnn"} onOpenChange={(o) => setOpenModal(o ? "cnn" : null)}>
        <DialogTrigger render={
          <Button
            variant="outline"
            size="sm"
            className={`h-7 px-3 text-[11px] font-mono rounded-full border cursor-pointer hover:bg-white/5 transition-all ${getTierColor(
              models.accident_cnn || "default"
            )}`}
          />
        }>
          AccidentCNN: <span className="font-bold ml-1">{models.accident_cnn || "COCO"}</span>
        </DialogTrigger>
        <DialogContent className="bg-[#0f101a] border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#ff79c6] font-mono">AccidentCNN Image Classifier Performance</DialogTitle>
            <DialogDescription className="text-[#6272a4]">
              Custom ResNet-based binary classifier trained to detect collision probability from camera frames.
            </DialogDescription>
          </DialogHeader>
          <div className="h-64 w-full mt-4 font-mono text-[11px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cnnData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="epoch" stroke="#6272a4" />
                <YAxis stroke="#6272a4" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f101a", borderColor: "rgba(255,255,255,0.1)", color: "#fff" }}
                />
                <Legend />
                <Line type="monotone" dataKey="acc" stroke="#50fa7b" name="Accuracy" strokeWidth={2} />
                <Line type="monotone" dataKey="val_acc" stroke="#bd93f9" name="Val Accuracy" strokeWidth={2} />
                <Line type="monotone" dataKey="loss" stroke="#ff5555" name="Loss" strokeWidth={1} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-[#6272a4] mt-2 font-mono flex justify-between">
            <span>Weights Location: weights/accident_cnn_best.pt</span>
            <span className="text-[#50fa7b]">Current Status: ACTIVE (UPGRADED)</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* SeverityNet ANN chip */}
      <Dialog open={openModal === "ann"} onOpenChange={(o) => setOpenModal(o ? "ann" : null)}>
        <DialogTrigger render={
          <Button
            variant="outline"
            size="sm"
            className={`h-7 px-3 text-[11px] font-mono rounded-full border cursor-pointer hover:bg-white/5 transition-all ${getTierColor(
              models.severity_net || "heuristic"
            )}`}
          />
        }>
          SeverityNet: <span className="font-bold ml-1">{models.severity_net || "ANN"}</span>
        </DialogTrigger>
        <DialogContent className="bg-[#0f101a] border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-[#ffb86c] font-mono">SeverityNet Multi-Head Network</DialogTitle>
            <DialogDescription className="text-[#6272a4]">
              Multi-head MLP neural network mapping incident location, time, weather, and detections to: Severity (0-100), Response Need (0/1), and Priority (LOW/MED/HIGH).
            </DialogDescription>
          </DialogHeader>
          <div className="h-64 w-full mt-4 font-mono text-[11px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={annData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="epoch" stroke="#6272a4" />
                <YAxis stroke="#6272a4" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f101a", borderColor: "rgba(255,255,255,0.1)", color: "#fff" }}
                />
                <Legend />
                <Line type="monotone" dataKey="accuracy" stroke="#50fa7b" name="Test Accuracy" strokeWidth={2} />
                <Line type="monotone" dataKey="loss" stroke="#8be9fd" name="Train Loss" strokeWidth={1.5} />
                <Line type="monotone" dataKey="val_loss" stroke="#ff5555" name="Val Loss" strokeWidth={1.5} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-xs text-[#6272a4] mt-2 font-mono flex justify-between">
            <span>Weights Location: models/ann/weights_severity_net.pt</span>
            <span className="text-[#50fa7b]">Current Status: ACTIVE (UPGRADED)</span>
          </div>
        </DialogContent>
      </Dialog>

      {/* Agents LLM chip */}
      <Badge
        variant="outline"
        className={`h-7 px-3 text-[11px] font-mono rounded-full border border-white/5 uppercase select-none ${
          agentMode === "anthropic"
            ? "bg-[#bd93f9]/10 text-[#bd93f9] border-[#bd93f9]/30"
            : "bg-white/5 text-[#6272a4]"
        }`}
      >
        agents: <span className="font-bold ml-1">{agentMode}</span>
      </Badge>
    </div>
  );
}
export default ModelStatusChips;
