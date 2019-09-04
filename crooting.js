// // https://rosettacode.org/wiki/Averages/Simple_moving_average#JavaScript
const https = require('https');
const async = require('async');
const sma = require('sma');
const _ = require('lodash');
const fs = require('fs');

// Lodash moving avg: https://purelyfunctional.tv/article/moving-average/
function sum(numbers) {
  return _.reduce(numbers, (a, b) => a + b, 0);
}

function average(numbers) {
  return sum(numbers) / (numbers.length || 1);
}

function window(_number, index, array) {
  const start = Math.max(0, index - 3);
  const end   = Math.min(array.length, index + 3);
  return _.slice(array, start, end);
}

function make_window(before, after) {
  return function (_number, index, array) {
    const start = Math.max(0, index - before);
    const end   = Math.min(array.length, index + after + 1);
    return _.slice(array, start, end);
  }
}

function moving_average(before, after, numbers) {
  return _.chain(numbers)
          .map(make_window(before, after))
          .map(average)
          .value();
}

function makeJSONRequest(url, callback) {
    https.get(url, (resp) => {
        let data = '';

        // A chunk of data has been recieved.
        resp.on('data', (chunk) => {
            data += chunk;
        });

        // The whole response has been received. Print out the result.
        resp.on('end', () => {
            const jsonBody = JSON.parse(data);
            callback(null, jsonBody);
        });

    }).on("error", (err) => {
        console.log("[Crooting] Error: " + err.message);
        callback(`Error: ${err}`, []);
    });
};
// Source = https://www.reddit.com/r/ZenGMBasketballCoach/comments/35j0yy/320team_json_file_with_ncaa_schools_locations/
// read file = https://stackoverflow.com/questions/10011011/using-node-js-how-do-i-read-a-json-file-into-server-memory
var schools = JSON.parse(fs.readFileSync('colleges.json', 'utf8')).teams;

function findSchool(team) {
    var results = schools.filter(function(item) {
        return item.region == team.trim();
    })
    if (results.length > 0) {
        return results[0];
    } else {
        return null;
    }
}

// data from https://github.com/RanksEngine/College-Colors/blob/master/colors.json
var colors = JSON.parse(fs.readFileSync('colors.json', 'utf8'));
function findHexColor(team) {
    var results = colors.filter(function(item) {
        return item.name == team.trim();
    })
    if (results.length > 0) {
        return results[0].color1;
    } else {
        return '#000';
    }
}

// Data from https://www.footballoutsiders.com/stats/ncaa
function findSPPlus(school, year) {
  var sheet = JSON.parse(fs.readFileSync('spplus/' + encodeURIComponent(year) + '.json', 'utf8'));
  if (sheet != null && sheet.length > 0) {
    var results = sheet.filter(function(item) {
        return item.team == school.trim();
    })
    if (results.length > 0) {
        var teamData = results[0];
        return teamData.overall_rating;
    } else {
        return null;
    }
  } else {
    return null;
  }
}

function generateFileName(team, bluechip) {
    return "results/" + team.toLocaleLowerCase().replace(" ","-") + (bluechip ? "-bluechip" : "") + ".json";
}

function pullTeamData(team, year, blueChipFilter, callback) {
    var school = findSchool(team);
    if (school == null) {
        console.log("[Crooting] No school found locally.")
        return;
    }
    // https://flaviocopes.com/how-to-check-if-file-exists-node/
    var fileName = generateFileName(team, blueChipFilter);
    try {
      if (fs.existsSync(fileName)) {
          console.log("[Crooting] Team data already calculated -- see " + fileName + ".")
        return;
      }
    } catch(err) {
        console.error(err)
        return;
    }

    var urlTeam = team;
    if (team == "Miami-FL") {
        urlTeam = "Miami"
    } else if (team == "Miami-OH") {
        urlTeam = "Miami (OH)"
    }

    makeJSONRequest('https://api.collegefootballdata.com/recruiting/players?year=' + encodeURIComponent(year.toString()) + '&classification=HighSchool&team=' + encodeURIComponent(urlTeam),
    function(err, data) {
        var percent = 0;
        if (err) {
            console.log('[Crooting] Error: ' + err);
        } else {
            if (data.length > 0) {
                var instate = data.filter(function(item) {
                    var check = (item.stateProvince == school.state);
                    if (blueChipFilter == true) {
                        check = check && (item.stars >= 4);
                    }
                    return check;
                });
                percent = (instate.length / data.length) * 100;
                console.log("[Crooting] % of in-state" + ((blueChipFilter) ? " bluechip" : "") + " prospects in " + year + " " + team + " class: " + percent.toFixed(2) + "% (" + instate.length + " of " + data.length + ")");
            }
        }
        if (callback) {
            callback(percent, year);
        }
    });
}


function generateComparisonData(selectedTeam, filterForBluechips, startYear, endYear) {
  var dataset = [];
  var fileName = generateFileName(selectedTeam, filterForBluechips);
  async.timesSeries((endYear - startYear) + 1, function(n, next) {
      pullTeamData(selectedTeam, startYear + n, filterForBluechips, function(percent, yr) {
          next(null, { "year": yr, "percent" : percent, "spplus" : findSPPlus(selectedTeam, yr) });
      });
  }, function(err, results) {
      var block = [];
      results.forEach(function(item) {
          block.push(item.percent);
      });

      var avgs = moving_average(2, 2, block);
      var cleanDisplay = [];
      results.forEach(function(item, i) {
          cleanDisplay.push({ "year": item.year, "percent" : item.percent, "spplus" : item.spplus, "rollingAvg" : avgs[i] != null ? avgs[i] : 0 });
      });

      // console.log("ROLLING AVG: ");
      // console.log(cleanDisplay);
      // https://stackoverflow.com/questions/2496710/writing-files-in-node-js
      fs.mkdir('results', { recursive : true }, function(error) {
          if (error && !error.toString().includes('EEXIST')) {
              console.log("[Crooting] Something went wrong while saving - " + error);
          } else {
              fs.writeFile(fileName, JSON.stringify({"data" : cleanDisplay, "team" : selectedTeam.trim(), "color" : findHexColor(selectedTeam.trim())}), function(err) {
                  if(err) {
                      return console.log(err);
                  }

                  console.log("[Crooting] Saved team data to " + fileName + ".");
              });
          }
      });
  });
}

var argv = require('minimist')(process.argv.slice(2));
// supported args: node crooting.js --team="<team>" --bluechipsOnly=<bool> --startYear=<int> --endYear=<int>


var team = argv.team; // Note: Miami can be Miami-FL or Miami-OH, but not just "Miami"
var bluechipsFiltered = (argv.hasOwnProperty('bluechipsOnly') && argv.bluechipsOnly != null) ? argv.bluechipsOnly : false;

// S&P+ only has data between 2005 and 2018, account for that.
var sYear = (argv.hasOwnProperty('startYear') && argv.startYear != null) ? parseInt(argv.startYear) : 2005;
var eYear = (argv.hasOwnProperty('endYear') && argv.endYear != null) ? parseInt(argv.endYear) : 2018;

if (team == null) {
  console.log("[Crooting] Team not provided. Please use the --team parameter.");
} else if (sYear < 2005 || sYear > 2018) {
  console.log("[Crooting] Please provide a start year between 2005 and 2018.");
} else if (eYear < 2005 || eYear > 2018) {
  console.log("[Crooting] Please provide an end year between 2005 and 2018.");
} else if (eYear < sYear) {
  console.log("[Crooting] Please provide an end year for the dataset that is greater than or equal to its start year.");
} else {
  // console.log("[Crooting] Args: ", argv);
  console.log("[Crooting] Generating data for " + team + " between given years " + sYear + " and " + eYear + (bluechipsFiltered ? " and filtering for bluechips" : "") + "...");
  generateComparisonData(team, bluechipsFiltered, sYear, eYear);
}
