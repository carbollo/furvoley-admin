FROM nousresearch/hermes-agent:latest

ENV HERMES_HOME=/opt/data
VOLUME ["/opt/data"]

COPY config.yaml.template /opt/data/config.yaml.template
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["gateway", "run"]
