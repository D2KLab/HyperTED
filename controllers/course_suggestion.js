import SparqlClient from './sparql_client.mjs';

const openUniversity = new SparqlClient('http://data.open.ac.uk/sparql');
const openCourseWare = new SparqlClient('http://data.linkedu.eu/ocw/query');


// openUniversity.prefix_map = {
//   purl: 'http://purl.org/dc/terms/',
//   'w3-ont': 'http://www.w3.org/TR/2010/WD-mediaont-10-20100608/',
//   dbpedia: 'http://dbpedia.org/property/',
//   openlearn: 'http://data.open.ac.uk/openlearn/ontology/',
// };

// openCourseWare.prefix_map = {
//   linkedu: 'http://data.linkedu.eu/ontology/',
//   purl: 'http://purl.org/dc/terms/',
//   dbpedia: 'http://dbpedia.org/property/',
// };


function getFromOpenUniversity(keywords) {
  // keywords: array to regex
  const regex = `(${keywords.join(')|(')})`;

  const q = `SELECT DISTINCT ?course ?description ?title ?subject ?locator
   FROM <http://data.open.ac.uk/context/openlearn>  '
   WHERE {
     ?course purl:description ?description ;
          purl:title ?title;
          purl:subject ?subject;
          w3-ont:locator ?locator;
          a openlearn:OpenLearnUnit .
      {  FILTER EXISTS {
           FILTER regex(str(?description), "${regex}", "i" )
           FILTER regex(str(?title), "${regex}", "i" )
       }
      } UNION {
         FILTER EXISTS {
           FILTER regex(str(?description), "${regex}", "i" )
         }
      } UNION {
        FILTER EXISTS {
           FILTER regex(str(?title), "${regex}", "i" )
        }
      }
   }`;
  return openUniversity.query(q).then((data) => {
    if (!data) return [];

    const cList = data.results.bindings;
    if (!cList || !cList.length) return [];

    // score: first the courses with more matches
    const rg = new RegExp(regex, 'gi');
    cList.forEach((c) => {
      const s = c.title.value + c.description.value;
      c.score = s.match(rg).length;
      c.source = 'openuniversity';
    });
    return cList;
  });
}

function getFromOpenCourseWare(keywords) {
  // keywords: array to regex
  const regex = `(${keywords.join(')|(')})`;

  const q = `SELECT DISTINCT  ?course ?title ?subject ?description ?locator
  WHERE {
   ?course a linkedu:OpenEducationalResource;
          purl:title ?title;
          purl:description ?description;
          purl:subject ?subject;
          dbpedia:url ?locator.
    { FILTER EXISTS {
      FILTER regex(str(?description), "${regex}", "i" )
      FILTER regex(str(?title), "${regex}", "i" )
      }
    } UNION {
      FILTER EXISTS {
        FILTER regex(str(?description), "${regex}", "i" )
      }
    } UNION {
      FILTER EXISTS {
        FILTER regex(str(?title), "${regex}", "i" )
      }
   }
 } LIMIT 1000`;
  return openCourseWare.query(q)
    .then((data) => {
      if (!data) return [];

      const cwList = data.results.bindings;
      if (!cwList || !cwList.length) return [];

      // scrore: first the courses with more matches
      const rg = new RegExp(regex, 'gi');
      cwList.forEach((c) => {
        const s = c.title.value + c.description.value;
        c.score = s.match(rg).length;
        c.source = 'opencourseware';
      });

      return cwList;
    });
}

export default function getSuggestedCourses(keywords = []) {
  if (!Array.isArray(keywords) || !keywords.length) {
    throw new Error('Keywords Parameter must be an array with at least 1 strings');
  }

  return Promise.all([
    getFromOpenUniversity(keywords),
    getFromOpenCourseWare(keywords),
  ]).then((data) => {
    const [dataOU, dataOC] = data;
    const coursesList = dataOU.concat(dataOC);

    // remove duplicates
    coursesList.sort((a, b) => {
      if (b.locator.value === a.locator.value) return a.score - b.score;
      return b.locator.value.localeCompare(a.locator.value);
    });
    coursesList.reverse();
    let oldTitle = '';
    for (const [k, course] in Object.entries(coursesList)) {
      if (course.locator.value === oldTitle) {
        coursesList.splice(k, 1);
      } else oldTitle = course.locator.value;
    }

    // order for score
    coursesList.sort((a, b) => b.score - a.score);

    return coursesList;
  });
}
