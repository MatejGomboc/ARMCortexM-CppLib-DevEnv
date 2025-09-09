# STAGE 1: Download, verify, and extract
FROM debian:13-slim AS downloader

WORKDIR /root

RUN apt-get update && \
    apt-get install -y wget unzip tar xz-utils && \
    wget -q https://github.com/ninja-build/ninja/releases/download/v1.13.1/ninja-linux.zip && \
    echo "0830252db77884957a1a4b87b05a1e2d9b5f658b8367f82999a941884cbe0238  ninja-linux.zip" | sha256sum --check && \
    unzip -q ninja-linux.zip -d /usr/local/bin && \
    wget -q https://github.com/Kitware/CMake/releases/download/v4.1.1/cmake-4.1.1-linux-x86_64.tar.gz && \
    echo "5a6c61cb62b38e153148a2c8d4af7b3d387f0c8c32b6dbceb5eb4af113efd65a  cmake-4.1.1-linux-x86_64.tar.gz" | sha256sum --check && \
    mkdir -p /opt/cmake && \
    tar -xzf cmake-4.1.1-linux-x86_64.tar.gz -C /opt/cmake --strip-components=1 && \
    wget -q https://developer.arm.com/-/media/Files/downloads/gnu/14.3.rel1/binrel/arm-gnu-toolchain-14.3.rel1-x86_64-arm-none-eabi.tar.xz && \
    wget -q https://developer.arm.com/-/media/Files/downloads/gnu/14.3.rel1/binrel/arm-gnu-toolchain-14.3.rel1-x86_64-arm-none-eabi.tar.xz.sha256asc && \
    sha256sum --check arm-gnu-toolchain-14.3.rel1-x86_64-arm-none-eabi.tar.xz.sha256asc && \
    mkdir -p /opt/arm-none-eabi-gcc && \
    tar -xf arm-gnu-toolchain-14.3.rel1-x86_64-arm-none-eabi.tar.xz -C /opt/arm-none-eabi-gcc --strip-components=1

# STAGE 2: Final minimal image
FROM debian:13-slim

WORKDIR /root

ENV PATH="/opt/arm-none-eabi-gcc/bin:/opt/cmake/bin:${PATH}"

# Labels for GitHub Container Registry
LABEL org.opencontainers.image.source="https://github.com/MatejGomboc/ARMCortexM-CppLib-DevEnv"
LABEL org.opencontainers.image.description="Development environment for ARMCortexM-CppLib"
LABEL org.opencontainers.image.licenses="ApacheV2.0"

# Copy the extracted tools directly to their final locations
COPY --from=downloader /usr/local/bin/ninja /usr/local/bin/
COPY --from=downloader /opt/cmake/ /opt/cmake/
COPY --from=downloader /opt/arm-none-eabi-gcc/ /opt/arm-none-eabi-gcc/

RUN apt-get update && \
    apt-get install -y llvm-19-tools && \
    rm -rf /var/lib/apt/lists/* && \
    ln -s /usr/bin/FileCheck-19 /usr/bin/FileCheck && \
    ln -s /usr/bin/FileCheck-19 /usr/bin/filecheck && \
    ninja --version && \
    cmake --version && \
    arm-none-eabi-gcc --version && \
    filecheck --version && \
    FileCheck --version
