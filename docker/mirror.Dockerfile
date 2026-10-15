# Re-publishes an upstream OpenG2P image unchanged in ECR, so deploys pull a
# pinned copy from our registry instead of a moving Docker Hub tag.
ARG BASE_IMAGE
FROM ${BASE_IMAGE}
