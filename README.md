# ARMCortexM-CppLib-DevEnv

Development environment [for ARMCortexM-CppLib](https://github.com/MatejGomboc/ARMCortexM-CppLib)

## 🐳 Docker Image

This repository provides a pre-built Docker image with all necessary tools for ARMCortexM-CppLib development.

### Quick Start

Pull the latest image from GitHub Container Registry:

```bash
docker pull ghcr.io/matejgomboc/armcortexm-cpplib-devenv:latest
```

### Using the Development Environment

#### Interactive Shell

```bash
docker run -it --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  ghcr.io/matejgomboc/armcortexm-cpplib-devenv:latest \
  /bin/bash
```

#### Building a Project

```bash
docker run --rm \
  -v $(pwd):/workspace \
  -w /workspace \
  ghcr.io/matejgomboc/armcortexm-cpplib-devenv:latest \
  cmake -B build -S . -DARM_CORTEX_M_ARCH=0
```

#### With VS Code Dev Containers

Add to your `.devcontainer/devcontainer.json`:

```json
{
  "image": "ghcr.io/matejgomboc/armcortexm-cpplib-devenv:latest",
  "workspaceFolder": "/workspace",
  "workspaceMount": "source=${localWorkspaceFolder},target=/workspace,type=bind"
}
```

### Available Tags

- `latest` - Latest stable build from main branch
- `edge` - Latest development build
- `main-<sha>` - Specific commit builds
- `YYYYMMDD` - Date-based tags for reproducibility

### Included Tools

- **Build System**
  - Ninja Build v1.13.1
  - CMake v4.1.1

- **ARM Toolchain**
  - ARM GNU Toolchain 14.3.rel1
  - Full arm-none-eabi-* suite

- **Testing Tools**
  - LLVM 19 FileCheck

### Building Locally

If you prefer to build the image locally:

```bash
docker build -t armcortexm-dev .
```

## Licence

This project is licensed under the Apache Licence Version 2.0.  
Copyright (C) 2025 Matej Gomboc <https://github.com/MatejGomboc/ARMCortexM-CppLib-DevEnv>.  
See the attached [LICENCE](./LICENCE) file for more info.
