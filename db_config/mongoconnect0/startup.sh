#!/bin/bash

mongo="${MONGO:-hyperted_mongo}"
mongoport="${MONGOPORT:-27027}"
elasticsearch="${ELASTICSEARCH:-hyperted_elasticsearch}"
elasticport="${ELASTICPORT:-9200}"


function _mongo() {
    mongo --quiet --host ${mongo} --port ${mongoport} <<EOF
    $@
EOF
}

is_master_result="false"
expected_result="true"

while true;
do
  if [ "${is_master_result}" == "${expected_result}" ] ; then
    is_master_result=$(_mongo "rs.isMaster().ismaster")
    echo "Waiting for Mongod node to assume primary status..."
    sleep 3
  else
    echo "Mongod node is now primary"
    break;
  fi
done

sleep 1

mongo-connector -c /tmp/config.json --auto-commit-interval=0 --oplog-ts=/data/oplog.ts -m ${mongo}:${mongoport} -t ${elasticsearch}:${elasticport} -d elastic_doc_manager
