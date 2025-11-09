FROM debian:13-slim AS downloader

ARG NINJA_VERSION=v1.13.1
ARG CMAKE_VERSION=v4.1.1
ARG ARM_NONE_EABI_VERSION=14.3.rel1
ARG COSIGN_VERSION=v3.0.2

# hadolint ignore=DL3002
USER root:root

WORKDIR /root

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# hadolint ignore=DL3008,DL4001
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates wget unzip tar xz-utils curl jq && \
    NINJA_FILE="ninja-linux.zip" && \
    NINJA_API_RESPONSE=$(curl -sSL "https://api.github.com/repos/ninja-build/ninja/releases/tags/${NINJA_VERSION}") && \
    NINJA_DIGEST=$(echo "${NINJA_API_RESPONSE}" | jq -r ".assets[] | select(.name == \"${NINJA_FILE}\") | .digest") && \
    if [ -z "${NINJA_DIGEST}" ] || [ "${NINJA_DIGEST}" = "null" ]; then \
        echo "ERROR: Failed to get Ninja digest from GitHub API"; \
        echo "API Response: ${NINJA_API_RESPONSE}"; \
        exit 1; \
    fi && \
    if [[ ! "${NINJA_DIGEST}" =~ ^sha256: ]]; then \
        echo "ERROR: Unexpected Ninja digest format: ${NINJA_DIGEST}"; \
        echo "Expected format: sha256:HASH"; \
        exit 1; \
    fi && \
    NINJA_HASH=$(echo "${NINJA_DIGEST}" | cut -d: -f2) && \
    wget -q "https://github.com/ninja-build/ninja/releases/download/${NINJA_VERSION}/${NINJA_FILE}" && \
    echo "${NINJA_HASH}  ${NINJA_FILE}" | sha256sum --check && \
    unzip -q "${NINJA_FILE}" -d /usr/local/bin && \
    rm "${NINJA_FILE}" && \
    CMAKE_VERSION_NUM="${CMAKE_VERSION#v}" && \
    CMAKE_FILE="cmake-${CMAKE_VERSION_NUM}-linux-x86_64.tar.gz" && \
    CMAKE_API_RESPONSE=$(curl -sSL "https://api.github.com/repos/Kitware/CMake/releases/tags/${CMAKE_VERSION}") && \
    CMAKE_DIGEST=$(echo "${CMAKE_API_RESPONSE}" | jq -r ".assets[] | select(.name == \"${CMAKE_FILE}\") | .digest") && \
    if [ -z "${CMAKE_DIGEST}" ] || [ "${CMAKE_DIGEST}" = "null" ]; then \
        echo "ERROR: Failed to get CMake digest from GitHub API"; \
        echo "API Response: ${CMAKE_API_RESPONSE}"; \
        exit 1; \
    fi && \
    if [[ ! "${CMAKE_DIGEST}" =~ ^sha256: ]]; then \
        echo "ERROR: Unexpected CMake digest format: ${CMAKE_DIGEST}"; \
        echo "Expected format: sha256:HASH"; \
        exit 1; \
    fi && \
    CMAKE_HASH=$(echo "${CMAKE_DIGEST}" | cut -d: -f2) && \
    wget -q "https://github.com/Kitware/CMake/releases/download/${CMAKE_VERSION}/${CMAKE_FILE}" && \
    echo "${CMAKE_HASH}  ${CMAKE_FILE}" | sha256sum --check && \
    mkdir -p /opt/cmake && \
    tar -xzf "${CMAKE_FILE}" -C /opt/cmake --strip-components=1 && \
    rm "${CMAKE_FILE}" && \
    ARM_NONE_EABI_FILE="arm-gnu-toolchain-${ARM_NONE_EABI_VERSION}-x86_64-arm-none-eabi.tar.xz" && \
    ARM_NONE_EABI_HASH_FILE="${ARM_NONE_EABI_FILE}.sha256asc" && \
    wget -q "https://developer.arm.com/-/media/Files/downloads/gnu/${ARM_NONE_EABI_VERSION}/binrel/${ARM_NONE_EABI_FILE}" && \
    wget -q "https://developer.arm.com/-/media/Files/downloads/gnu/${ARM_NONE_EABI_VERSION}/binrel/${ARM_NONE_EABI_HASH_FILE}" && \
    sha256sum --check "${ARM_NONE_EABI_HASH_FILE}" && \
    mkdir -p /opt/arm-none-eabi-gcc && \
    tar -xf "${ARM_NONE_EABI_FILE}" -C /opt/arm-none-eabi-gcc --strip-components=1 && \
    rm "${ARM_NONE_EABI_FILE}" "${ARM_NONE_EABI_HASH_FILE}" && \
    ARCH="$(uname -m)" && \
    case "$ARCH" in \
        x86_64) COSIGN_ARCH="amd64" ;; \
        aarch64) COSIGN_ARCH="arm64" ;; \
        *) echo "Unsupported architecture: $ARCH"; exit 1 ;; \
    esac && \
    curl -sSfL "https://github.com/sigstore/cosign/releases/download/${COSIGN_VERSION}/cosign-linux-${COSIGN_ARCH}" \
        -o /usr/local/bin/cosign && \
    chmod +x /usr/local/bin/cosign && \
    cosign version

FROM debian:13-slim

LABEL org.opencontainers.image.title="ARMCortexM-CppLib Development Environment" \
    org.opencontainers.image.description="Development environment for ARMCortexM-CppLib" \
    org.opencontainers.image.authors="Matej Gomboc" \
    org.opencontainers.image.source="https://github.com/MatejGomboc/ARMCortexM-CppLib-DevEnv" \
    org.opencontainers.image.vendor="https://github.com/MatejGomboc" \
    org.opencontainers.image.licenses="Apache-2.0"

# hadolint ignore=DL3002
USER root:root

WORKDIR /root

ENV PATH="/opt/arm-none-eabi-gcc/bin:/opt/cmake/bin:${PATH}"

COPY --from=downloader /usr/local/bin/ninja /usr/local/bin/
COPY --from=downloader /usr/local/bin/cosign /usr/local/bin/
COPY --from=downloader /opt/cmake/ /opt/cmake/
COPY --from=downloader /opt/arm-none-eabi-gcc/ /opt/arm-none-eabi-gcc/

SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# hadolint ignore=DL3008
RUN apt-get update && \
    apt-get install -y --no-install-recommends ca-certificates git llvm-19-tools && \
    apt-get upgrade -y && \
    rm -rf /var/lib/apt/lists/* && \
    ln -s /usr/bin/FileCheck-19 /usr/bin/FileCheck && \
    ln -s /usr/bin/FileCheck-19 /usr/bin/filecheck && \
    ninja --version && \
    cmake --version && \
    arm-none-eabi-gcc --version && \
    git --version && \
    filecheck --version && \
    FileCheck --version && \
    cosign version

CMD ["/bin/bash"]
