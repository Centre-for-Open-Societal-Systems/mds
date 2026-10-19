# OpenG2P MDS UI with this repo's sidebar (Crops, Livestock, Seeds, Inputs,
# Geography) applied at build time instead of on every container start.
ARG BASE_IMAGE=openg2p/master-data-ui:develop
FROM ${BASE_IMAGE}
WORKDIR /app
COPY customize_sidebar.js /tmp/customize_sidebar.js
RUN node /tmp/customize_sidebar.js
