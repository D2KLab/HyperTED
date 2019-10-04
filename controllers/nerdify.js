import nerd from 'nerd4node';
import Promise from 'bluebird';
import SparqlClient from './sparql_client.mjs';

const client = new SparqlClient('http://dbpedia.org/sparql');

const API_INSTANCE = 'nerd.eurecom.fr/api/';
// var apiID = '1qb6bi7kjmcudkh5gsqr79ufmflo4mlu';
const apiID = '155ma0q9dpavn42uol7geocve20t1l22';
const gran = 'oed';
const to = 10; // timeOut

function getDbpediaAbstract(wikiUrl) {
  let topic;
  if (wikiUrl.indexOf('wikipedia') >= 0) {
    topic = `?res <http://xmlns.com/foaf/0.1/isPrimaryTopicOf> <${wikiUrl}>.`;
  } else if (wikiUrl.indexOf('dbpedia') >= 0) {
    topic = `FILTER (?res = <${wikiUrl}> ).`;
  } else {
    const tErr = new Error(`could not retrieve abstract for ${wikiUrl}`);
    return Promise.reject(tErr);
  }

  const query = `select distinct ?res ?abstract where {
         ?res dbo:abstract ?abstract.
         ${topic}
         FILTER langMatches( lang(?abstract), 'en')
      } LIMIT 100`;

  return client.query(query)
    .then((data) => {
      if (!data.results.bindings || !data.results.bindings.length) return null;

      if (!data.results.bindings[0].abstract) return null;
      return data.results.bindings[0].abstract.value;
    });
}


export default function getEntities(doctype, text, ext = 'textrazor') {
  if (!ext) ext = 'textrazor';
  if (!text) return Promise.reject(new Error('Empty Text'));

  return new Promise((resolve, reject) => {
    nerd.annotate(API_INSTANCE, apiID, ext, doctype, text, gran, to, (err, data) => {
      if (err) {
        reject(err);
        return;
      }
      console.log(`TOT Ents ${data.length}`);

      const prom = Promise.mapSeries(data, (ent) => {
        if (!ent.uri) return null;
        return getDbpediaAbstract(ent.uri)
          .then((abstract) => {
            ent.abstract = abstract;
          });
      }).then(() => data);

      resolve(prom);
    });
  });
}
