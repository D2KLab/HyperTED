MediaFragPlayerDemo
===================

Media Fragment Player Demo

## Requirements

* [Node.js](http://www.nodejs.org/)
* A [MongoDB](http://www.mongodb.org) database running at port 27017
* An instance of [Elasticsearch](http://www.elasticsearch.org) running at port 9200

We suggest also to install [ffmpeg](https://www.ffmpeg.org/) and add it to enviroment variables in order to have access to mp4 metadata (es. duration of videos).

## Install

All "npm" dependencies are specified on package.json, so you can install them with 
<pre>npm install</pre>

## Run

<pre>node project_path\server</pre>

You can browse the application at <code>localhost:8080</code>


## Related project

In this application, the following project/library are used

* [Nerd4Node](https://github.com/giusepperizzo/nerd4node)
* [media-fragment.js](https://github.com/tomayac/Media-Fragments-URI) and its [Node.js version](https://github.com/pasqLisena/node-mediafragment)
