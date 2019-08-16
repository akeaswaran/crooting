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
        console.log("Error: " + err.message);
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

function pullTeamData(team, year, blueChipFilter, callback) {
    var school = findSchool(team);
    if (school == null) {
        console.log("No school found locally.")
        return;
    }
    makeJSONRequest('https://api.collegefootballdata.com/recruiting/players?year=' + encodeURIComponent(year.toString()) + '&classification=HighSchool&team=' + encodeURIComponent(team),
    function(err, data) {
        var percent = 0;
        if (err) {
            console.log('Error: ' + err);
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
                console.log("% of in-state" + ((blueChipFilter) ? " bluechip" : "") + " prospects in " + year + " " + team + " class: " + percent.toFixed(2) + "% (" + instate.length + " of " + data.length + ")");
            }
        }
        if (callback) {
            callback(percent, year);
        }
    });
}

var dataset = [];
var selectedTeam = "Georgia Tech";
var endYear = 2020;
var startYear = 2002;

async.timesSeries((endYear - startYear), function(n, next) {
    pullTeamData(selectedTeam, startYear + n, true, function(percent, yr) {
        next(null, { "year": yr, "percent" : percent });
    });
}, function(err, results) {
    var block = [];
    results.forEach(function(item) {
        block.push(item.percent);
    });

    var avgs = moving_average(2, 2, block);
    var cleanDisplay = [];
    results.forEach(function(item, i) {
        cleanDisplay.push({ "year": item.year, "rollingAvg" : avgs[i] != null ? avgs[i] : 0 });
    });

    console.log("ROLLING AVG: ");
    console.log(cleanDisplay);
});
