import SparqlClient from './sparql_client.mjs';

const client = new SparqlClient('http://data.linkedtv.eu/sparql');

// exports.prepare = function prepare() {
//   client.prefix_map = {
//     ma: 'http://www.w3.org/ns/ma-ont#',
//     rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
//     oa: 'http://www.w3.org/ns/oa#',
//     linkedtv: 'http://data.linkedtv.eu/ontologies/core#',
//     nsa: 'http://multimedialab.elis.ugent.be/organon/ontologies/ninsuna#',
//     dc: 'http://purl.org/dc/elements/1.1/',
//     owl: 'http://www.w3.org/2002/07/owl#',
//   };
// };

function generateIdentifier(uuid) {
  return `<http://data.linkedtv.eu/media/${uuid}>`;
}

function getVideoFromUuid(uuid) {
  const identifier = generateIdentifier(uuid);
  const q = `SELECT DISTINCT ?locator
  WHERE {
    ${identifier} a ma:MediaResource;
    ma:locator ?locator;
  }`;

  return client.query(q)
    .then((data) => {
      const { bindings } = data.results;
      if (!bindings.length) throw new Error('No results in sparql endpoint (getVideoFromUuid)');

      const locator = bindings[0].locator.value;
      return locator;
    });
}

function reduceSparqlJSON(bindings) {
  let result;

  const IDs = [];
  bindings.forEach((row) => {
    const thisID = row.MediaResource.value;
    if (!IDs.length || !(thisID in IDs)) IDs.push(thisID);
  });

  const results = [];
  IDs.forEach((id) => {
    const MR = {};
    bindings.filter((row) => row.MediaResource.value === id)
      .forEach((row) => {
        if (!MR.MediaResource) MR.MediaResource = row.MediaResource;

        if (row.chapter) {
          if (!MR.chapters) MR.chapters = [];

          const chapter = {
            chapter: row.chapter,
            tStart: row.tStart,
            tEnd: row.tEnd,
            tUnit: row.tUnit,
            mediafragment: row.mediafragment,
          };
          MR.chapters.push(chapter);
        }
        if (row.keyURL) {
          if (!MR.entities) {
            MR.entities = [];
            MR.entitiesFromLTV = true;
          }

          const entType = row.entType ? row.entType.value : null;
          const source = row.source ? row.source.value : null;
          const label = row.label ? row.label.value : null;

          const entity = {
            uri: row.keyURL,
            label,
            extractor: source,
            source: 'linkedtv',
            startNPT: parseFloat(row.tStart.value).toFixed(3),
            endNPT: parseFloat(row.tEnd.value).toFixed(3),
            tUnit: row.tUnit.value,
            nerdType: entType,
            mediafragment: row.mediafragment,
          };
          const existsYet = MR.entities.some((ent) => {
            if (ent.uri.value === entity.uri.value) {
              if (entity.nerdType && (!ent.nerdType || !ent.nerdType.match(/nerd.eurecom.fr/))) {
                ent.nerdType = entity.nerdType;
              }
              return true;
            }
            return false;
          }, entity);

          if (!existsYet) MR.entities.push(entity);
        }
      });

    results.push(MR);
  });

  result = results.filter((res) => res.chapters || res.entities);
  if (result.length > 1) result = result.filter((res) => res.chapters);

  return result[0];
}

function getVideoFromLocator(locator) {
  const t = locator.indexOf('?ticket');
  if (t > 0) locator = locator.substring(0, t);


  const q = `SELECT DISTINCT ?MediaResource, ?mediafragment, ?chapter, ?tEnd, ?tStart, ?tUnit, ?keyURL, ?label, ?source, ?entType
    WHERE {
      ?MediaResource a ma:MediaResource ;
            ma:locator <${locator}> .

     OPTIONAL {
      ?mediafragment a ma:MediaFragment ;
              ma:isFragmentOf ?MediaResource ;
              nsa:temporalEnd ?tEnd ;
              nsa:temporalStart ?tStart ;
              nsa:temporalUnit ?tUnit .
      OPTIONAL {
        ?annotation a oa:Annotation ;
          oa:hasTarget ?mediafragment;
          oa:hasBody ?chapter.
        ?chapter a linkedtv:Chapter. }
      OPTIONAL {
        ?mediafragment linkedtv:hasSubtitle ?subtitle.
        ?entityAnnotation a oa:Annotation ;
            oa:hasTarget ?mediafragment ;
            oa:hasBody ?entity.
        ?entity owl:sameAs ?keyURL.
        OPTIONAL { ?entity rdf:type ?entType. }
        OPTIONAL { ?entity rdfs:label ?label.}
        OPTIONAL { ?entity dc:source ?source.}}
    }
  } ORDER BY ?tStart`;


  return client.query(q)
    .then((data) => {
      if (!data) throw new Error('No results in sparql endpoint (getVideoFromLocator)');
      const { bindings } = data.results;
      if (!bindings.length) return null;

      let result;
      if (bindings.length === 1) {
        result = bindings[0]; // eslint-disable-line prefer-destructuring
      } else {
        result = reduceSparqlJSON(bindings);
      }

      // extract uuid
      const re = /data\.linkedtv\.eu\/media\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
      result.ltv_uuid = re.exec(result.MediaResource.value)[1];

      return result;
    });
}


export default {
  getVideoFromLocator,
  getVideoFromUuid,
};
