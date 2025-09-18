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

- `latest` - Latest stable build from main branch. It's updated during each merge into main and also weekly through a cron job (every Saturday at 00:00 AM UTC).
- `1.2.3` - Build from a release tag with an exact version (immutable) each time such kind of a tag is created.
- `1.2` - Latest patch version of the 1.2.x series (updated each time a new 1.2.x is created).
- `1` - Latest version of the 1.x.x series (updated each time a new 1.x.x is created).

### Included Tools

- **Build System**
  - Ninja Build
  - CMake

- **ARM Toolchain**
  - complete arm-none-eabi-* suite

- **Testing Tools**
  - LLVM FileCheck

### Building Locally

If you prefer to build the image locally:

```bash
docker build -t armcortexm-dev .
```

## Licence

This project is licensed under the Apache Licence Version 2.0.  
Copyright (C) 2025 Matej Gomboc <https://github.com/MatejGomboc/ARMCortexM-CppLib-DevEnv>.  
See the attached [LICENCE](./LICENCE) file for more info.
