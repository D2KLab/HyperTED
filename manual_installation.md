Instruction for installing WITHOUT `docker-compose`.

## Install


- Start mongo

      docker run -d -p 27027:27017 --restart=unless-stopped  -v /home/semantic/hyperted/HyperTED/database:/database --user $(id -u):$(id -g) --name hyperted_mongo mongo:3.4 --replSet rs --dbpath /database --httpinterface --rest

      <!-- --configExpand rest -->


      docker exec -it  hyperted_mongo mongo

```js
var cfg = {
      "_id": "rs",
      "version": 1,
      "members": [
          {
              "_id": 0,
              "host": "172.17.0.5:27017",
              "priority": 1
          }
      ]
};
rs.initiate(cfg, { force: true });
rs.reconfig(cfg, { force: true });
db.getMongo().setReadPref('nearest');
```

- Start elasticsearch

      docker run -d -p 9200:9200 --restart=unless-stopped  -v /home/semantic/hyperted/HyperTED/elasticsearch:/usr/share/elasticsearch/data --name hyperted_elastic elasticsearch:1.7


- Start web

      docker build -t hyperted/web .
      docker run -d -p 8011:8011 --restart=unless-stopped --name hyperted_web hyperted/web


- Start mongoconnector

      docker build -t hyperted/mongoconnector ./db_config/mongoconnect0
      docker run --name hyperted_mongoconnect hyperted/mongoconnector

- Set up network

      docker network create hyperted   --driver=bridge --subnet=10.0.0.40/16 --ip-range=10.0.0.50/24 --gateway=10.0.0.254
      docker network connect hyperted hyperted_mongo
      docker network connect hyperted hyperted_elastic
      docker network connect hyperted hyperted_mongoconnect
      docker network connect hyperted hyperted_web


      docker network disconnect hyperted hyperted_mongo
      docker network disconnect hyperted hyperted_elastic
      docker network disconnect hyperted hyperted_mongoconnect
      docker network disconnect hyperted hyperted_web

## Uninstall

      docker stop hyperted_web
      docker rm hyperted_web
      docker rmi hyperted/web

      docker stop hyperted_mongoconnect
      docker rm hyperted_mongoconnect
      docker rmi hyperted/mongoconnector

      docker stop hyperted_elastic
      docker rm hyperted_elastic

      docker stop hyperted_mongo
      docker rm hyperted_mongo

      docker network rm hyperted
