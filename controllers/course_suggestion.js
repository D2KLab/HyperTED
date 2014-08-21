var sparql = require("sparql");

var openUniversity = new sparql.Client('http://data.open.ac.uk/sparql');
openUniversity.prefix_map = {
    'purl': 'http://purl.org/dc/terms/',
    'w3-ont': 'http://www.w3.org/TR/2010/WD-mediaont-10-20100608/',
    'dbpedia': 'http://dbpedia.org/property/',
    'openlearn': 'http://data.open.ac.uk/openlearn/ontology/'
};

var openCourseWare = new sparql.Client('http://data.linkedu.eu/ocw/query');
openCourseWare.prefix_map = {
    'linkedu': 'http://data.linkedu.eu/ontology/',
    'purl': 'http://purl.org/dc/terms/',
    'dbpedia': 'http://dbpedia.org/property/'
};


function getFromOpenUniversity(keywords, callback) {
    if (!keywords instanceof Array) {
        callback(Error('Keywords Parameter must be an array of strings'));
        return;
    }

    //TODO integrate keyword

    openUniversity.query('SELECT DISTINCT ?course ?description ?title ?subject ?locator ' +
            ' FROM <http://data.open.ac.uk/context/openlearn>  ' +
            'where {    ' +
            '?course purl:description ?description.   ' +
            ' ?course purl:title ?title.    ' +
            '?course purl:subject ?subject.    ' +
            '?course w3-ont:locator ?locator.   ' +
            '?course a <http://data.open.ac.uk/openlearn/ontology/OpenLearnUnit>   ' +
            '{  FILTER EXISTS {' +
            '  	  FILTER regex(str(?description), "languages", "i" )' +
            '  	  FILTER regex(str(?title), "languages", "i" )' +
            '  	}' +
            '  }UNION	{' +
            '  	FILTER EXISTS {' +
            '  		  FILTER regex(str(?description), "languages", "i" )' +
            '	}' +
            '  } UNION 	{' +
            '  	FILTER EXISTS {' +
            '  		  FILTER regex(str(?title), "languages", "i" )' +
            '  	}' +
            '  }' +
            '  }  ',
        function (err, data) {
            if (err || !data) {
                callback(err, data);
                return;
            }

            var coursesList = data.results.bindings;
            if (!coursesList || !coursesList.length) {
                callback(err, null);
            return;
            }

            //TODO merge results
            callback(err, coursesList);
        }
    );
}