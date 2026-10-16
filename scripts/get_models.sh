#!/usr/bin/env bash
# LaMa inpainting and YOLOX-s detection, both Apache-2.0, from the OpenCV model zoo.
set -e; mkdir -p models; cd models
[ -s lama.onnx ]  || curl -fsSL -o lama.onnx  https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/inpainting_lama/inpainting_lama_2025jan.onnx
[ -s yolox.onnx ] || curl -fsSL -o yolox.onnx https://media.githubusercontent.com/media/opencv/opencv_zoo/main/models/object_detection_yolox/object_detection_yolox_2022nov.onnx
ls -la
