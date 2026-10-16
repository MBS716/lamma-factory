#!/usr/bin/env bash
# LaMa inpainting, YOLOX-s detection, PP-OCRv3 text detection and EfficientSAM (all Apache-2.0) from the OpenCV model zoo.
set -e; mkdir -p models; cd models
[ -s lama.onnx ]  || curl -fsSL -o lama.onnx  https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/inpainting_lama/inpainting_lama_2025jan.onnx
[ -s yolox.onnx ] || curl -fsSL -o yolox.onnx https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/object_detection_yolox/object_detection_yolox_2022nov.onnx
[ -s textdet.onnx ] || curl -fsSL -o textdet.onnx https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/text_detection_ppocr/text_detection_en_ppocrv3_2023may.onnx
if [ ! -s esam_enc.onnx ] || [ ! -s esam_dec.onnx ]; then
  [ -s esam.onnx ] || curl -fsSL --retry 4 -o esam.onnx https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/image_segmentation_efficientsam/image_segmentation_efficientsam_ti_2025april.onnx
  python - <<'PY'
from onnx.utils import extract_model
E = "/image_encoder/neck/neck.3/Add_1_output_0"   # image embedding: encode once, prompt many times
extract_model("esam.onnx", "esam_enc.onnx", ["batched_images"], [E])
extract_model("esam.onnx", "esam_dec.onnx", [E, "batched_point_coords", "batched_point_labels"], ["output_masks", "iou_predictions"])
PY
  rm -f esam.onnx
fi
ls -la
