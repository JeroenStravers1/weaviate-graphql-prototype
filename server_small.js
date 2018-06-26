/**
                     __          __                         
_____________  _____/  |_  _____/  |_ ___.__.______   ____  
\____ \_  __ \/  _ \   __\/  _ \   __<   |  |\____ \_/ __ \ 
|  |_> >  | \(  <_> )  | (  <_> )  |  \___  ||  |_> >  ___/ 
|   __/|__|   \____/|__|  \____/|__|  / ____||   __/ \___  >
|__|                                  \/     |__|        \/ 

THIS IS A PROTOTYPE!

Note: you can follow the construction of the Graphql schema by starting underneath: "START CONSTRUCTING THE SERVICE"

*/

// Express for the webserver & graphql
const express = require('express');
const graphqlHTTP = require('express-graphql');
// const laurasResolver = require('./laurasResolver.js');

// For making calls to http data server
// const request = require('request');

// file system for reading files
const fs = require('fs');

// define often used GraphQL constants
const {
  GraphQLSchema,
  GraphQLObjectType,
  GraphQLUnionType,
  GraphQLEnumType,
  GraphQLInputObjectType,
  GraphQLInterfaceType,
  GraphQLBoolean,
  GraphQLInt,
  GraphQLFloat,
  GraphQLString,
  GraphQLID,
  GraphQLList,
} = require('graphql');


/**
 * START - ALL RELATED TO INTERNAL FUNCTION
 */

/**
 * Create arguments for the network function
 */
var argsKeywords = new GraphQLInputObjectType({
  name: "argsKeywords",
  description: "list of keywords and weights",
  fields: {
    keyword: {
      name: "WeaviateNetworkKeywordsKeyword",
      description: "The keyword",
      type: GraphQLString
    },
    weight: {
      name: "WeaviateNetworkKeywordsWeigth",
      description: "The weight",
      type: GraphQLFloat
    }
  }
})

/**
 * create arguments for a search
 */
var propsForArgs = {} //global
function createArgs(item, withKeywords){

  // check if argument name is defined, if not, create it
  if(propsForArgs[item.class] == undefined){

    // empty argument
    propsForArgs[item.class] = {}

    // always certainty
    propsForArgs[item.class]["_certainty"] = {
      type: GraphQLFloat,
      description: "How certain about these values?"
    }
    // always return limit
    propsForArgs[item.class]["_limit"] = {
      type: GraphQLInt,
      description: "define the max returned values."
    }

    if(withKeywords === true){
      // always certainty
      propsForArgs[item.class]["_keywords"] = {
        type: new GraphQLList(argsKeywords),
        description: "Add a keyword?"
      }
    }
    
    // loop over property variables (not classes, therefor it checks if the first letter is uppercase)
    if(item.properties != undefined){
      item.properties.forEach(prop => {
        if(prop["@dataType"][0][0] !== prop["@dataType"][0][0].toUpperCase()){ // is the first letter uppercase?
          propsForArgs[item.class][prop.name] = {
            type: GraphQLString, // for now, always return a string
            description: prop.description
          }
        }
      })
    }

  }
  
  return propsForArgs[item.class] // return the prop with the argument

}

/**
 * Create the subclasses of a Thing or Action in the Local function
 */
function createSubClasses(ontologyThings){

  console.log("------START SUBCLASSES--------")

  var subClasses = {};
  // loop through classes
  ontologyThings.classes.forEach(singleClass => {

    //console.log(singleClass.class)

    // create recursive sub classes
    subClasses[singleClass.class] = new GraphQLObjectType({
      name: singleClass.class,
      description: singleClass.description,
      fields: function(){
        // declare props that should be returned
        var returnProps = {}
        
        // loop over properties
        singleClass.properties.forEach(singleClassProperty => {

          singleClassProperty["@dataType"].forEach(singleClassPropertyDatatype => {
            // if class (start with capital, return Class)
            if(singleClassPropertyDatatype[0] === singleClassPropertyDatatype[0].toUpperCase()){
              // return class as list, set the first to upper to show it is a class

              ontologyThings.classes.forEach(thing => {
                if(thing.class === singleClassPropertyDatatype){
                  returnProps[singleClassProperty.name[0].toUpperCase() + singleClassProperty.name.substring(1)] = {
                    description: singleClassProperty.description,
                    type: new GraphQLList(subClasses[singleClassPropertyDatatype]),
                    args: createArgs(thing, false),
                    resolve() {
                      console.log("resolve ROOT CLASS " + singleClassProperty.name[0].toUpperCase() + singleClassProperty.name.substring(1))
                      return [{}] // resolve with empty array
                    }
                  }
                }
              })
            } else if(singleClassPropertyDatatype === "string") {
              // always return string (should be int, float, bool etc later)
              returnProps[singleClassProperty.name] = {
                description: singleClassProperty.description,
                type: GraphQLString
              }
            } else if(singleClassPropertyDatatype === "int") {
              // always return string (should be int, float, bool etc later)
              returnProps[singleClassProperty.name] = {
                description: singleClassProperty.description,
                type: GraphQLInt
              }
            } else if(singleClassPropertyDatatype === "number") {
              // always return string (should be int, float, bool etc later)
              returnProps[singleClassProperty.name] = {
                description: singleClassProperty.description,
                type: GraphQLFloat
              }
            } else if(singleClassPropertyDatatype === "boolean") {
              // always return string (should be int, float, bool etc later)
              returnProps[singleClassProperty.name] = {
                description: singleClassProperty.description,
                type: GraphQLBoolean
              }
            } else {
              console.error("I DONT KNOW THIS VALUE! " + singleClassProperty["@dataType"][0])
              // always return string (should be int, float, bool etc later)
              returnProps[singleClassProperty.name] = {
                description: singleClassProperty.description,
                type: GraphQLString
              }
            }
          })
        });
        // console.log(returnProps)
        return returnProps
      }
    });

  });

  console.log("------DONE SUBCLASSES--------")

  return subClasses;
}

/**
 * Create the rootclasses of a Thing or Action in the Local function
 */
function createRootClasses(ontologyThings, subClasses){

  console.log("------START ROOTCLASSES--------")

  var rootClassesFields = {}

  // loop through classes
  ontologyThings.classes.forEach(singleClass => {
    // create root sub classes
    rootClassesFields[singleClass.class] = {
      type: new GraphQLList(subClasses[singleClass.class]),
      description: singleClass.description,
      args: createArgs(singleClass, false),
      resolve() {
        console.log("resolve ROOT CLASS " + singleClass.class)
        return [{}] // resolve with empty array
      }
    }

  })

  console.log("------STOP ROOTCLASSES--------")

  return rootClassesFields

}

/**
 * Merge ontologies because both actions and things can refer to eachother
 */
function mergeOntologies(a, b){
  /*
  var contains = function(needle) {
      // Per spec, the way to identify NaN is that it is not equal to itself
      var findNaN = needle !== needle;
      var indexOf;

      if(!findNaN && typeof Array.prototype.indexOf === 'function') {
          indexOf = Array.prototype.indexOf;
      } else {
          indexOf = function(needle) {
              var i = -1, index = -1;

              for(i = 0; i < this.length; i++) {
                  var item = this[i];

                  if((findNaN && item !== item) || item === needle) {
                      index = i;
                      break;
                  }
              }

              return index;
          };
      }

      return indexOf.call(this, needle) > -1;
  };
  */
  var classCounter = [];
 
  var classes = {}
  classes["classes"] = []

  a.classes.forEach(singleClassA => {
    classCounter.push(singleClassA.class)
    classes["classes"].push(singleClassA)
  })

  b.classes.forEach(singleClassB => {
    classes["classes"].push(singleClassB)
  })

  console.log("------DONE--------")
  return classes
}

/**
 * END - ALL RELATED TO INTERNAL
 */

/**
 * START - ALL RELATED TO NETWORK
 */

/**
 * Nounfields are used in the Network service
 */
function createNounFields(nouns, depth){

  var returner = {}
  var subReturner = {}

  var splitNouns = nouns.split('\n');

  // first we create subfields
  for(var no = 0; no < splitNouns.length; no++){
    // set regex for nouns
    splitNouns[no] = splitNouns[no].replace(/\W/g, '');
    subReturner[splitNouns[no]] = {
      name: "WeaviateNetworkSubfield" + splitNouns[no],
      description: "No description available",
      args: createArgs("_", true),
      resolve() {
        console.log("resolve WeaviateNetworkSubfield" + splitNouns[no])
        return [{}] // resolve with empty array
      },
      type: GraphQLString
    }
  }

  var superSubreturner = new GraphQLObjectType({
    name: "superSubreturner",
    fields: subReturner
  })

  // second we create actual fields
  for(var no = 0; no < splitNouns.length; no++){
    // set regex for nouns
    splitNouns[no] = splitNouns[no].replace(/\W/g, '');
    // set to upper because of 
    let nounAsClass = splitNouns[no][0].toUpperCase() + splitNouns[no].substring(1);
    returner[nounAsClass] = {
      name: "WeaviateNetworkSubfield" + nounAsClass,
      description: "No description available",
      args: createArgs("_", true),
      resolve() {
        console.log("resolve WeaviateNetworkSubfield" + nounAsClass)
        return [{}] // resolve with empty array
      },
      type: superSubreturner
    }

  }

  return returner

}

/**
 * END - ALL RELATED TO INTERNAL
 */

/**
 * START CONSTRUCTING THE SERVICE
 */
fs.readFile('schemas_small/things_schema.json', 'utf8', function(err, ontologyThings) { // read things ontology
  fs.readFile('schemas_small/actions_schema.json', 'utf8', function(err, ontologyActions) { // read actions ontology
    fs.readFile('schemas_small/nounlist.txt', 'utf8', function(err, nouns) { // read the nounlist

      // merge
      classes = mergeOntologies(JSON.parse(ontologyThings), JSON.parse(ontologyActions))
    
      // create the root and sub classes based on the Weaviate schemas
      var subClasses = createSubClasses(classes);
      var rootClassesThingsFields = createRootClasses(JSON.parse(ontologyThings), subClasses);
      var rootClassesActionsFields = createRootClasses(JSON.parse(ontologyActions), subClasses);

      var NounFields = createNounFields(nouns, true);

      // This is the root 
      var Weaviate = new GraphQLObjectType({
        name: 'WeaviateObj',
        description: "Location of the root query",
        fields: {
          Local: {
            name: "WeaviateLocal",
            description: "Locate on the local Weaviate",
            resolve() {
              console.log("resolve WeaviateLocal")
              return [{}] // resolve with empty array
            },
            type: new GraphQLObjectType({
              name: "WeaviateLocalObj",
              description: "Type of fetch on the internal Weaviate",
              resolve() {
                console.log("resolve WeaviateLocalObj")
                return [{}] // resolve with empty array
              },
              fields: {
                TargetedFetch: {
                  name: "WeaviateLocalTargetedFetch",
                  description: "Do a targeted fetch to search Things or Actions on the local weaviate",
                  type: new GraphQLObjectType({
                    name: "WeaviateLocalTargetedFetchObj",
                    description: "Fetch things or actions on the internal Weaviate",
                    fields: {
                      Things: {
                        name: "WeaviateLocalTargetedFetchThings",
                        description: "Locate Things on the local Weaviate",
                        type: new GraphQLObjectType({
                          name: "WeaviateLocalTargetedFetchThingsObj",
                          description: "Fetch things on the internal Weaviate",
                          fields: rootClassesThingsFields
                        }),
                        resolve() {
                          console.log("resolve WeaviateLocalTargetedFetchThings")
                          return [{}] // resolve with empty array
                        },
                      },
                      Actions: {
                        name: "WeaviateLocalTargetedFetchActions",
                        description: "Locate Actions on the local Weaviate",
                        type: new GraphQLObjectType({
                          name: "WeaviateLocalTargetedFetchActionsObj",
                          description: "Fetch Actions on the internal Weaviate",
                          fields: rootClassesActionsFields
                        }),
                        resolve() {
                          console.log("resolve WeaviateLocalTargetedFetchActions")
                          return [{}] // resolve with empty array
                        }
                      }
                    }
                  }),
                  resolve() {
                    console.log("resolve WeaviateLocalTargetedFetch")
                    return [{}] // resolve with empty array
                  },
                },
                HelpersFetch: {
                  name: "WeaviateLocalHelpersFetch",
                  description: "Do a helpers fetch to search Things or Actions on the local weaviate",
                  type: new GraphQLObjectType({
                    name: "WeaviateLocalHelpersFetchObj",
                    description: "Fetch things or actions on the internal Weaviate",
                    fields: {
                      PinPoint: {
                        name: "WeaviateLocalHelpersFetchPinPoint",
                        description: "Find a set of exact ID's of Things or Actions on the local Weaviate",
                        args: {
                          _stack: {
                            type: new GraphQLEnumType({
                              name: "WeaviateLocalHelpersFetchPinPointStackEnum",
                              values: {
                                Things: {
                                  value: rootClassesThingsFields,
                                },
                                Actions: {
                                  value: rootClassesActionsFields,
                                }
                              }
                            })
                          }, //Things or Actions ENUM
                          _classes: {type: GraphQLString}, //an array of potential classes (they should be in the ontology!)
                          _properties: {type: GraphQLString}, //an array of potential classes (they should be in the ontology, ideally related to the class!)
                          _needle: {type: GraphQLString}, //the actual field that will be used in the search. (for example: __needle: "Netflix"
                          _searchType: {type: GraphQLString}, //should be an ENUM but for now only 1 value: "standard"
                          _limit: {type: GraphQLInt}
                        },
                        type: new GraphQLObjectType({
                          name: "WeaviateLocalHelpersFetchPinPointObj",
                          description: "Fetch uuid of Things or Actions on the internal Weaviate",
                          fields: rootClassesActionsFields
                        }),
                        resolve() {
                          console.log("resolve WeaviateLocalHelpersFetchPinPoint")
                          return [{}] // resolve with empty array
                        },
                      }
                    }
                  }),
                  resolve() {
                    console.log("resolve WeaviateLocalHelpersFetch")
                    return [{}] // resolve with empty array
                  },
                },
                MetaFetch: {
                  name: "WeaviateLocalMetaFetch",
                  description: "Fetch meta infromation about Things or Actions on the local weaviate",
                  type: new GraphQLList(GraphQLString), // no input required yet
                  resolve() {
                    console.log("resolve WeaviateLocalMetaFetch")
                    return [{}] // resolve with empty array
                  },
                },
              }
            })
          },
          Network: {
            name: "WeaviateNetwork",
            description: "Locate on the Weaviate network",
            type: new GraphQLObjectType({
              name: "WeaviateNetworkObj",
              description: "Type of fetch on the Weaviate network",
              fields: {
                FuzzyFetch: {
                  name: "WeaviateNetworkFuzzyFetch",
                  description: "Do a fuzzy search fetch to search Things or Actions on the network weaviate",
                  type: new GraphQLList(GraphQLString), // no input required yet
                  resolve() {
                    console.log("resolve WeaviateNetworkFuzzyFetch")
                    return [{}] // resolve with empty array
                  },
                },
                HelpersFetch: {
                  name: "WeaviateNetworkHelpersFetch",
                  description: "Do a fetch with help to search Things or Actions on the network weaviate",
                  type: new GraphQLList(GraphQLString), // no input required yet
                  resolve() {
                    console.log("resolve WeaviateNetworkHelpersFetch")
                    return [{}] // resolve with empty array
                  },
                },
                MetaFetch: {
                  name: "WeaviateNetworkMetaFetch",
                  description: "To fetch meta information Things or Actions on the network weaviate",
                  type: new GraphQLList(GraphQLString), // no input required yet
                  resolve() {
                    console.log("resolve WeaviateNetworkMetaFetch")
                    return [{}] // resolve with empty array
                  },
                },
              }
            }) 
          }
        }
      })

      // publish the schemas, for now only the query schema
      const schema = new GraphQLSchema({
        query: Weaviate
      });

      // run the webserver
      const app = express();
      app.use(express.static(__dirname));
      app.use('/graphql', graphqlHTTP(() => ({ schema, graphiql: true })));
      app.listen(8081, function() {
        const port = this.address().port;
        console.log(`Started on http://localhost:${port}/graphql`);
      });

    });

  });

});
