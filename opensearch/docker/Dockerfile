FROM opensearchproject/opensearch:2.11.1

# Install Korean analyzer plugin (Nori)
RUN /usr/share/opensearch/bin/opensearch-plugin install --batch analysis-nori

# Install ICU plugin for better Unicode support
RUN /usr/share/opensearch/bin/opensearch-plugin install --batch analysis-icu
