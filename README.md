HyperTED
===================

Searching and browsing through fragments of TED Talks.


## Install and run

- Make sure you have [Docker](https://www.docker.com/) installed and running.

- Run the application with

      docker-compose up --build

#### Dev Mode

For better developing the web part of the application.

- Run the database part with

      docker-compose -f docker-compose-dev.yml up

- Install npm dependencies

      npm install

- Run the server

      npm start

You can browse the application at http://localhost:8011/HyperTED


# Related project

In this application, the following software/library are used
* [Node.js](http://www.nodejs.org/)
* A [MongoDB](http://www.mongodb.org) database
* [Elasticsearch](http://www.elasticsearch.org)
* [Nerd4Node](https://github.com/giusepperizzo/nerd4node)
* [media-fragment.js](https://github.com/tomayac/Media-Fragments-URI) and its [Node.js version](https://github.com/pasqLisena/node-mediafragment)
* [Synote Media Fragment Player](http://smfplayer.synote.org/smfplayer/)
