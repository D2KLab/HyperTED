# This will prepare a elasticsearch node with mongo-connector enabled
# inspired by https://github.com/yeasy/docker-mongo-connector

FROM python:3.5

ENV DEBIAN_FRONTEND noninteractive
ENV TZ Europe/Paris

# Installing Mongo Connector which will connect MongoDB and Elasticsearch
RUN pip install 'pathlib2'
RUN pip install 'mongo-connector[elastic]'

COPY startup.sh /tmp/
COPY config.json /tmp/

VOLUME /data


# Sample usage when no commands is given outside
CMD ["/bin/bash", "/tmp/startup.sh"]
