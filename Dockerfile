ARG NINJA_VERSION="1.13.1"
ARG CMAKE_VERSION="4.1.1"
ARG ARM_NONE_EABI_GCC_VERSION="14.3.rel1"
ARG FILECHECK_VERSION="19"

# STAGE 1: Download, verify, and extract
FROM debian:12-slim AS downloader

WORKDIR /root

RUN apt-get update && \
    apt-get install -y wget curl jq unzip tar xz-utils

# Download, verify, and extract ninja
RUN wget -q https://github.com/ninja-build/ninja/releases/download/v${NINJA_VERSION}/ninja-linux.zip && \
    NINJA_SHA256=$(curl -s https://api.github.com/repos/ninja-build/ninja/releases/tags/v${NINJA_VERSION} | \
        jq -r '.assets[] | select(.name=="ninja-linux.zip") | .digest' | cut -d: -f2) && \
    echo "${NINJA_SHA256}  ninja-linux.zip" | sha256sum --check && \
    mkdir -p /opt/ninja && \
    unzip -q ninja-linux.zip -d /opt/ninja && \
    rm ninja-linux.zip

# Download, verify, and extract CMake
RUN wget -q https://github.com/Kitware/CMake/releases/download/v${CMAKE_VERSION}/cmake-${CMAKE_VERSION}-linux-x86_64.tar.gz && \
    CMAKE_SHA256=$(curl -s https://api.github.com/repos/Kitware/CMake/releases/tags/v${CMAKE_VERSION} | \
        jq -r '.assets[] | select(.name=="cmake-${CMAKE_VERSION}-linux-x86_64.tar.gz") | .digest' | cut -d: -f2) && \
    echo "${CMAKE_SHA256}  cmake-${CMAKE_VERSION}-linux-x86_64.tar.gz" | sha256sum --check && \
    mkdir -p /opt/cmake && \
    tar -xzf cmake-${CMAKE_VERSION}-linux-x86_64.tar.gz -C /opt/cmake --strip-components=1 && \
    rm cmake-${CMAKE_VERSION}-linux-x86_64.tar.gz

# Download, verify, and extract ARM toolchain
RUN wget -q https://developer.arm.com/-/media/Files/downloads/gnu/&{ARM_NONE_EABI_GCC_VERSION}/binrel/arm-gnu-toolchain-&{ARM_NONE_EABI_GCC_VERSION}-x86_64-arm-none-eabi.tar.xz && \
    wget -q https://developer.arm.com/-/media/Files/downloads/gnu/&{ARM_NONE_EABI_GCC_VERSION}/binrel/arm-gnu-toolchain-&{ARM_NONE_EABI_GCC_VERSION}-x86_64-arm-none-eabi.tar.xz.sha256asc && \
    sha256sum --check arm-gnu-toolchain-&{ARM_NONE_EABI_GCC_VERSION}-x86_64-arm-none-eabi.tar.xz.sha256asc && \
    mkdir -p /opt/arm-none-eabi-gcc && \
    tar -xf arm-gnu-toolchain-&{ARM_NONE_EABI_GCC_VERSION}-x86_64-arm-none-eabi.tar.xz -C /opt/arm-none-eabi-gcc --strip-components=1 && \
    rm arm-gnu-toolchain-&{ARM_NONE_EABI_GCC_VERSION}-x86_64-arm-none-eabi.tar.xz && \
    rm arm-gnu-toolchain-&{ARM_NONE_EABI_GCC_VERSION}-x86_64-arm-none-eabi.tar.xz.sha256asc

# STAGE 2: Final minimal image
FROM debian:12-slim

WORKDIR /root

ENV PATH="/opt/arm-none-eabi-gcc/bin:/opt/cmake/bin:${PATH}"

# Labels for GitHub Container Registry
LABEL org.opencontainers.image.source="https://github.com/MatejGomboc/ARMCortexM-CppLib-DevEnv"
LABEL org.opencontainers.image.description="Development environment for ARMCortexM-CppLib"
LABEL org.opencontainers.image.licenses="ApacheV2.0"

# Install only runtime dependencies
RUN apt update && \
    apt upgrade -y && \
    apt-get install -y llvm-${FILECHECK_VERSION}-tools && \
    rm -rf /var/lib/apt/lists/* && \
    ln -s /usr/bin/FileCheck-${FILECHECK_VERSION} /usr/bin/filecheck && \
    ln -s /usr/bin/FileCheck-${FILECHECK_VERSION} /usr/bin/FileCheck

# Copy the extracted tools directly to their final locations
COPY --from=downloader /opt/ninja/ninja /usr/local/bin/
COPY --from=downloader /opt/cmake/ /opt/cmake/
COPY --from=downloader /opt/arm-none-eabi-gcc/ /opt/arm-none-eabi-gcc/

# Add health check script
COPY healthcheck.sh /usr/local/bin/healthcheck.sh
RUN chmod +x /usr/local/bin/healthcheck.sh

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD ["/usr/local/bin/healthcheck.sh"]

# Default command
CMD ["/bin/bash"]
