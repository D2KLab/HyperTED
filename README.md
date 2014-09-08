MediaFragPlayerDemo
===================

Media Fragment Player Demo

# Requirements

* [Node.js](http://www.nodejs.org/)
* A [MongoDB](http://www.mongodb.org) database running:
* An instance of [Elasticsearch](http://www.elasticsearch.org) running at port 9201

We suggest also to install [ffmpeg](https://www.ffmpeg.org/) and add it to enviroment variables, in order to have access to mp4 metadata (es. duration of videos).

# Install

### Database

Run MongoDB at port 2701 with [replica set enabled](http://docs.mongodb.org/manual/tutorial/deploy-replica-set/). Maybe you can use
<pre>mongod --dbpath DB_PATH --replSet "rs0"</pre>
The first time you need to run <code>rs.initiate()</code>.

Install the following plugin for Elasticsearch
<pre>
ES_HOME/bin/plugin -install elasticsearch/elasticsearch-mapper-attachments/1.4.0
ES_HOME/bin/plugin -install com.github.richardwilly98.elasticsearch/elasticsearch-river-mongodb/2.0.1
</pre>

Then, you have to run
<pre>
curl -XPUT '/_river/hyperted/_meta' -d
{
  "type": "mongodb",
  "mongodb": {
    "servers": [
      { "host": "localhost", "port": 27017 }
    ],
    "db": "hyperted",
    "collection": "entities",
    "options": { "secondary_read_preference": true },
    "gridfs": false
  },
  "index": {
    "name": "ent_index",
    "type": "entity"
  }
}

curl -XPUT '/_river/hypertedHS/_meta' -d
{
  "type": "mongodb",
  "mongodb": {
    "servers": [
      { "host": "localhost", "port": 27017 }
    ],
    "db": "hyperted",
    "collection": "hotspots",
    "options": { "secondary_read_preference": true },
    "gridfs": false
  },
  "index": {
    "name": "hs_index",
    "type": "hotspot"
  }
}
</pre>

*If you can not use <code>curl</code>, you can also run it with [Sense extension](https://chrome.google.com/webstore/detail/sense-beta/lhjgkmllcaadmopgmanpapmpjgmfcfig) for Google Chrome.
In this case the first rows become <code>PUT /_river/hyperted/_meta</code>*

### Server

All "npm" dependencies are specified on package.json, so you can install them with 
<pre>npm install</pre>


# Run

<pre>node PROJECT_HOME\server</pre>

You can browse the application at <code>localhost:8011</code>


# Related project

In this application, the following project/library are used

* [Nerd4Node](https://github.com/giusepperizzo/nerd4node)
* [media-fragment.js](https://github.com/tomayac/Media-Fragments-URI) and its [Node.js version](https://github.com/pasqLisena/node-mediafragment)
* [Synote Media Fragment Player](http://smfplayer.synote.org/smfplayer/)
