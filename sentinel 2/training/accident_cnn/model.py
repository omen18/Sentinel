"""AccidentCNN — from-scratch convolutional classifier (accident vs normal frame).

Deliberately hand-built (no pretrained backbone) so you can defend every layer:
Conv-BN-ReLU blocks -> progressive downsampling -> global average pooling -> FC head.

Interview talking points:
- BatchNorm after conv: stabilizes training, allows higher LR.
- GlobalAvgPool instead of Flatten: 10x fewer params, resolution-agnostic, less overfit.
- Dropout only in the head: conv features are already regularized by BN + augmentation.
"""
import torch
import torch.nn as nn


def conv_block(c_in, c_out, pool=True):
    layers = [
        nn.Conv2d(c_in, c_out, kernel_size=3, padding=1, bias=False),
        nn.BatchNorm2d(c_out),
        nn.ReLU(inplace=True),
        nn.Conv2d(c_out, c_out, kernel_size=3, padding=1, bias=False),
        nn.BatchNorm2d(c_out),
        nn.ReLU(inplace=True),
    ]
    if pool:
        layers.append(nn.MaxPool2d(2))
    return nn.Sequential(*layers)


class AccidentCNN(nn.Module):
    def __init__(self, num_classes: int = 2):
        super().__init__()
        self.features = nn.Sequential(
            conv_block(3, 32),    # 224 -> 112
            conv_block(32, 64),   # 112 -> 56
            conv_block(64, 128),  # 56  -> 28
            conv_block(128, 256), # 28  -> 14
        )
        self.head = nn.Sequential(
            nn.AdaptiveAvgPool2d(1),
            nn.Flatten(),
            nn.Dropout(0.3),
            nn.Linear(256, 128),
            nn.ReLU(inplace=True),
            nn.Dropout(0.3),
            nn.Linear(128, num_classes),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.features(x))


if __name__ == "__main__":
    m = AccidentCNN()
    n_params = sum(p.numel() for p in m.parameters()) / 1e6
    print(m(torch.randn(2, 3, 224, 224)).shape, f"| params: {n_params:.2f}M")
