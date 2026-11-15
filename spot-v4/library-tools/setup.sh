#!/bin/bash
# Recreate the guided-production workspace on a fresh machine (run from anywhere):
#   bash spot-v4/library-tools/setup.sh
# -> /home/claude/sd/tools/kit.py, /home/claude/spot2/kit2.py, /home/claude/spot3/{run,qc,look2,...}.py, /home/claude/models/{lama,esam}.onnx
set -e
L=$(cd "$(dirname "$0")" && pwd)
mkdir -p /home/claude/sd/tools /home/claude/spot2 /home/claude/spot3/{manual,out,look,lib,stage,src,batches} /home/claude/models
cp "$L/kit.py" /home/claude/sd/tools/kit.py
cp "$L/kit2.py" /home/claude/spot2/
cp -r "$L/specs" /home/claude/spot2/ 2>/dev/null || true
cp "$L"/{run,qc,look2,detect,export,assemble,colorshare,batch_build}.py "$L/BRIEF.md" /home/claude/spot3/ 2>/dev/null || true
cd /home/claude/models
[ -s lama.onnx ] || curl -fsSL --retry 4 -o lama.onnx https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/inpainting_lama/inpainting_lama_2025jan.onnx
[ -s esam.onnx ] || curl -fsSL --retry 4 -o esam.onnx https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/image_segmentation_efficientsam/image_segmentation_efficientsam_ti_2025april.onnx
python3 -c "import onnxruntime, cv2, PIL" || pip install --break-system-packages -q onnxruntime opencv-python-headless pillow
echo "workspace ready"
