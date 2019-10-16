# Source https://github.com/yeasy/docker-mongosetup

FROM mongo:3.0
MAINTAINER yeasy@github

ENV DEBIAN_FRONTEND noninteractive
ENV TZ Europe/Paris

COPY docker-entrypoint.sh /tmp/

# Sample usage when no commands is given outside
ENTRYPOINT ["/bin/bash", "/tmp/docker-entrypoint.sh"]
