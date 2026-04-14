# Third-Party Licenses

Facenox includes open-source frameworks and bundled model components.

Some packaged model files in this repository use generic integration names such as `recognizer.onnx`, `detector.onnx`, and `liveness.onnx`. Those filenames are Facenox integration names only. They do not change the original authorship or license of the upstream work described below.

## Core Frameworks and Runtimes

These projects are used as application frameworks, runtimes, or supporting libraries.

| Component | License | Upstream |
| --- | --- | --- |
| Electron | MIT | https://github.com/electron/electron |
| React | MIT | https://github.com/facebook/react |
| FastAPI | MIT | https://github.com/fastapi/fastapi |
| ONNX Runtime | MIT | https://github.com/microsoft/onnxruntime |
| OpenCV | Apache-2.0 | https://github.com/opencv/opencv |

## Bundled Model Components

### Face Recognition

- Facenox ships a face recognition model at `server/assets/models/recognizer.onnx`.
- This bundled recognizer is based on EdgeFace and redistributed in ONNX form for Facenox desktop inference.
- Facenox may rename, package, and optimize the deployment artifact, but original authorship and license remain with the upstream project.
- Upstream project: https://github.com/otroshi/edgeface
- Upstream license: BSD-3-Clause

### EdgeFace Notice

Copyright (c) 2024, Anjith George, Christophe Ecabert, Hatef Otroshi Shahreza, Ketan Kotwal, Sebastien Marcel  
Idiap Research Institute, Martigny 1920, Switzerland.

Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

### Face Detection

- Facenox ships a face detection model at `server/assets/models/detector.onnx`.
- This bundled detector is based on YuNet and integrated for local desktop inference.
- Facenox uses a generic deployment filename in this repository, but the underlying detector provenance remains YuNet.
- Upstream project references:
  - https://huggingface.co/opencv/face_detection_yunet
  - https://github.com/opencv/opencv_zoo
- Upstream license: MIT

### YuNet Notice

Copyright (c) 2020 Shiqi Yu <shiqi.yu@gmail.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Object Tracking

- The local face tracking pipeline itself is implemented around ByteTrack in `server/core/models/tracker`.
- Upstream project: https://github.com/FoundationVision/ByteTrack
- Upstream license: MIT

### ByteTrack Notice

Copyright (c) 2021 Yifu Zhang

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

### Face Anti-Spoofing / Liveness

- Facenox ships a liveness model at `server/assets/models/liveness.onnx`.
- Direct shipped source: https://github.com/facenox/face-antispoof-onnx
- Direct shipped source license: Apache-2.0
- The shipped liveness model is distributed from the Facenox anti-spoofing project and used in ONNX form for local desktop inference.
- The current Facenox anti-spoofing project documents MiniFASNet V2 SE as the active training architecture.
- Upstream lineage: the `face-antispoof-onnx` project states that it is based on the MiniFAS architecture from the Silent Face Anti-Spoofing project by Minivision AI.
- Lineage reference: https://github.com/minivision-ai/Silent-Face-Anti-Spoofing-APK

### Face Anti-Spoofing Notice

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this work except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

For the full Apache License 2.0 text, see:

- https://www.apache.org/licenses/LICENSE-2.0
- https://github.com/facenox/face-antispoof-onnx/blob/main/LICENSE
