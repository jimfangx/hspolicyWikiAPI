const express = require('express')
const { response } = require('express');
const cheerio = require('cheerio');
const superagent = require('superagent');
// const apiKey = require('./apiKeys.json')
const fs = require('fs')
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser')
var app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieParser())

/**
 * @todo tabroom entries to wiki links - // for tab to wiki entry matching: json file with entry school names with wiki links - if school name on tab = school name on wiki, the json entry is ""
 * @todo get all cites,  get all round reports
 */

app.get('/getpage', (req, resApp) => {

    var schoolSearchString = req.body.school
    schoolSearchString = schoolSearchString.replace('High School', "").trim()
    var competitorSearchString = req.body.entry.replace(' & ', "-")
    var specialSearch = require('./lookupTable.json')

    if (specialSearch[schoolSearchString] != undefined) {
        schoolSearchString = specialSearch[schoolSearchString]
    }

    // console.log(encodeURIComponent(schoolSearchString))

    try {
        superagent
            .get(`https://hspolicy.debatecoaches.org/${encodeURIComponent(schoolSearchString)}/`) // ex .get('https://hspolicy.debatecoaches.org/Bronx%20Science/')
            .redirects(2)
            .end((err, res) => {

                if (res.text.includes('Were you looking for one of the following pages instead')) { // wrong name - click on the first link with hspolicy header
                    var $ = cheerio.load(res.text)
                    var correctSchoolLink = ""
                    for (i = 0; i < $('.centered.panel', '#mainContentArea').children('.panel-body').children('div').children('ul').children('li').length; i++) {
                        if (!$($('.centered.panel', '#mainContentArea').children('.panel-body').children('div').children('ul').children('li')[i]).children('a')[0].attribs.href.includes('.com')) {
                            correctSchoolLink = "https://hspolicy.debatecoaches.org" + $($('.centered.panel', '#mainContentArea').children('.panel-body').children('div').children('ul').children('li')[i]).children('a')[0].attribs.href
                        }
                    }
                } else {
                    correctSchoolLink = `https://hspolicy.debatecoaches.org/${encodeURIComponent(schoolSearchString)}/`
                }

                superagent
                    .get(correctSchoolLink)
                    .redirects(0)
                    .end((err, resStudent) => {
                        var $ = cheerio.load(resStudent.text)
                        if ($('#tblTeams').children('tbody').children('tr').length > 1) { // if there are teams on the teams page of a school

                            for (i = 1; i < $('#tblTeams').children('tbody').children('tr').length; i++) { // start from 1 due to sortHeader
                                var website = $($($('#tblTeams').children('tbody').children('tr')[i]).children('td')[1]).children('span').children('a').text().replace('Aff', "").trim()
                                var altSearchStr = (competitorSearchString.substring(competitorSearchString.indexOf('-') + 1) + "-" + competitorSearchString.substring(0, competitorSearchString.indexOf('-')))

                                if (website === competitorSearchString) { //td[0] looks at the aff page column // Find the team on the team page on the wiki
                                    resApp.send("https://hspolicy.debatecoaches.org" + $($($('#tblTeams').children('tbody').children('tr')[i]).children('td')[1]).children('span').children('a')[0].attribs.href)
                                    return;
                                } else if (website === altSearchStr) {
                                    resApp.send("https://hspolicy.debatecoaches.org" + $($($('#tblTeams').children('tbody').children('tr')[i]).children('td')[1]).children('span').children('a')[0].attribs.href)
                                    return;
                                }
                            }
                            resApp.status(404)
                            resApp.send(`Wiki not found. Possible difference between tabroom entry and wiki entry.`)
                        }
                    })
                // check either aff column or neg column against the competitor entry names - if match, copy a tag href - if no matches at the end of the first run, switch the compeitor names and check again. if empty after both runs - return no wiki (1 person in the partership has a wiki support coming later)
            })
    } catch (err) {
        resApp.status(404)
        resApp.send(`Wiki not found. Possible difference between tabroom entry and wiki entry.`)
    }

})


app.get('/cites', (req, resApp) => {

})

app.get('/roundreports', (req, resApp) => {
    console.log(req.body)
    superagent
        .get(req.body.link)
        .redirects(0)
        .end((err, res) => {
            var $ = cheerio.load(res.text)
            var roundData = null
            var argOnDifferentLines = false;
            var returnArr = []
            for (i = 1; i < $('#tblReports').children('tbody').children('tr').length; i++) { // check if this needs to be <=
                roundData = {
                    "tournament": "",
                    "round": "",
                    "oppoent": "",
                    "judge": "",
                    "1ac": [],
                    "1nc": [],
                    "2ac": [],
                    "2nc": [],
                    "1nr": [],
                    "1ar": [],
                    "2nr": [],
                    "2ar": []
                }
                roundData.tournament = $($($('#tblReports').children('tbody').children('tr')[i]).children('td')[0]).text()
                roundData.round = $($($('#tblReports').children('tbody').children('tr')[i]).children('td')[1]).text()
                roundData.oppoent = $($($('#tblReports').children('tbody').children('tr')[i]).children('td')[2]).children('div').children('p').text().split('|')[0].trim()
                roundData.judge = $($($('#tblReports').children('tbody').children('tr')[i]).children('td')[2]).children('div').children('p').text().split('|')[1].trim()
                var argList = $($($('#tblReports').children('tbody').children('tr')[i]).children('td')[2]).children('div').children('div').html().toLowerCase().replace(/<\/p>/g, "").replace(/<\\p>/g, "").replace(/<p>/g, "\n").replace(/<\/br>/g, "\n").replace(/<\\br>/g, "\n").replace(/<br>/g, '\n').replace(/-/g, " ").trim().split('\n') // if 1ac has other text behind it in the elemnt - then its 1 thing, keep it. otherwise join all other elements until the next detection of a speech marker
                console.log("ARG LIST: " + argList)

                if (argList[0].includes('1ac') && argList[0].length <= 4) { // its args on every new line (https://hspolicy.debatecoaches.org/Chaminade/Ahuja-Hormozdiari%20Neg)
                    var editStr = argList
                    var tempArr = []
                    var segment = "1ac"
                    for (j = 1; j < editStr.length; j++) {

                        if (editStr[j].trim() == '1nc' || editStr[j].trim() == '2ac' || editStr[j].trim() == '2nc' || editStr[j].trim() == '1nr' || editStr[j].trim() == '1ar' || editStr[j].trim() == '2nr' || editStr[j].trim() == '2ar') {
                            // console.log(tempArr)
                            roundData[segment] = tempArr // close last segment
                            segment = editStr[j].trim()
                            tempArr = []
                        } else {
                            tempArr.push(editStr[j].trim())
                        }


                    }
                    roundData[segment] = tempArr
                } else if (argList[0].includes('1ac') && argList[0].length > 4) { // everything on 1 line seperated by spaces
                    var editStr = argList
                    var tempArr = []
                    var segment = "1ac"
                    var tempStr = ""
                    var lastStr = ""
                    var lastArgType = ""
                    var speech = ""

                    tempArr.push(editStr[0].replace('1ac', ""))
                    roundData['1ac'] = tempArr
                    editStr.splice(0, 1)
                    for (j = 0; j < argList.length; j++) {
                        editStr = argList[j].split(' ')
                        speech = editStr[0]
                        editStr.splice(0, 1)
                        tempArr = []
                        while (editStr.length > 0) {
                            // editStr[0] = editStr[0].
                            // if (editStr[0].indexOf('-') < 2 && editStr[0].indexOf('-') > 0) { // situations such as t-cjr
                            //     tempArr.push(editStr[0])
                            //     editStr.splice(0, 1)
                            // }
                            if (editStr[0] === 't' || editStr[0] === 'p') {
                                tempArr.push(tempStr)
                                lastArgType = editStr[0]
                                tempStr = editStr[0]
                                editStr.splice(0, 1)
                            }
                            if (editStr[0] != 't' && editStr[0] != 'p' && editStr[0] != 'cp' && editStr[0] != 'da' && editStr[0] != 'k') {
                                lastStr = editStr[0]
                                tempStr += " " + editStr[0]
                                editStr.splice(0, 1)
                            }
                            if (editStr[0] === 'cp' || editStr[0] === 'da' || editStr[0] === 'k' || editStr[0] === 'ct') {
                                if (editStr[editStr.length - 1] === 'k' || editStr[editStr.length - 1] === 'cp' || editStr[editStr.length - 1] === 'da' || editStr[editStr.length - 1] === 'ct') {
                                    if (lastArgType === "t" || lastArgType === "p") {
                                        tempArr.push(tempStr.replace(lastStr, "").trim())
                                        tempStr = lastStr + " " + editStr[0]
                                    } else {
                                        tempStr += " " + editStr[0]
                                    }
                                    editStr.splice(0, 1)
                                    tempArr.push(tempStr.trim())
                                    tempStr = ""
                                    lastArgType = '' // reset and standby for t & p
                                } else {

                                    tempArr.push(tempStr.trim())
                                    tempStr = editStr[0]
                                    editStr.splice(0, 1)
                                }


                            } else if (editStr.length == 0 && tempArr[tempArr.length - 1] != tempStr) { // last element, editStr is empty
                                tempArr.push(tempStr)
                            }
                        }
                        // tempArr.push(tempStr.trim())
                        roundData[speech] = tempArr

                    }
                }
                console.log("SORTED LIST: " + roundData['1nc'])
                returnArr.push(roundData)

                // break;
            }

            resApp.send(returnArr)

        })
})

app.get('/test', (req, resApp) => {
    x = req.body.lol.toLowerCase().replace(/\([^)]*\)/g, "").split('\n')
    for (i = 0; i < x.length; i++) {
        x[i] = x[i].trim()
    }
    resApp.send(x)
})


port = process.env.PORT;
if (port == null || port == "") {
    port = 8080;
}
app.listen(port)
console.log(`Listening at http://localhost:${port}`)