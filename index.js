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
                console.log($($($('#tblReports').children('tbody').children('tr')[i]).children('td')[0]).text())
                console.log($($($('#tblReports').children('tbody').children('tr')[i]).children('td')[1]).text())
                console.log($($($('#tblReports').children('tbody').children('tr')[i]).children('td')[2]).children('div').children('p').text().split('|')[0].trim())
                console.log($($($('#tblReports').children('tbody').children('tr')[i]).children('td')[2]).children('div').children('p').text().split('|')[1].trim())
                var argList = $($($('#tblReports').children('tbody').children('tr')[i]).children('td')[2]).children('div').children('div').html().toLowerCase().replace(/<\/p>/g, "").replace(/<\\p>/g, "").replace(/<p>/g, "\n").replace(/<\/br>/g, "\n").replace(/<\\br>/g, "\n").replace(/<br>/g, '\n').trim().split('\n') // if 1ac has other text behind it in the elemnt - then its 1 thing, keep it. otherwise join all other elements until the next detection of a speech marker
                console.log(argList)
                // for (j = 0; j < argList.length-1; j++) { // check if arguments directly follow speech marker without \n
                //     if (argList[j].includes('1ac') && argList[j].length > 4) { //1ac with actual argument content afterwards
                //         if (argList[j + 1].includes('1nc') || argList[j + 1].includes('2ac') || argList[j + 1].includes('2nc') || argList[j + 1].includes('1nr') || argList[j + 1].includes('1ar') || argList[j + 1].includes('2nr') || argList[j + 1].includes('2ar')) { // usually in those situations, the next line is just a brand new speech. doing this prevents situations such as: 1NC courts cp \n states cp \n ptx da (aka 1 arg on the same line as the speech marker)
                //             console.log(argList[j].replace('1ac', ""))
                //         } else {
                //             argOnDifferentLines = true
                //             break;
                //         }
                //     }


                // }

                if (argList[0].includes('1ac') && argList[0].length > 4) { // argument in one line with the speech marker
                    if ((argList[1].includes('1nc') || argList[1].includes('2ac') || argList[1].includes('2nc') || argList[1].includes('1nr') || argList[1].includes('1ar') || argList[j + 1].includes('2nr') || argList[1].includes('2ar'))) {
                        if (argList[1].length > 4) {
                            for (k = 0; k < argList.length; k++) {
                                argList[k] = argList[k].replace('1ac', "").replace('1nc', "").replace('2ac', "").replace('2nc', "").replace('1nr', "").replace('1ar', "").replace('2nr', "").replace('2ar', "").trim()
                                if (argList[k].includes('cp') || argList[k].includes('da') || argList[k].includes(' k ') || argList[k].includes(' t ')) { //ex: t enact cp nga cp advantage cp executive order cp concon cp amendment da 2020 da court packing ct dpt bad'
                                    if (argList[k].charAt(0) == '-' || argList[k].charAt(0) == '*') { // if there are markers seperating each arg
                                        if (argList[k].charAt(0) == '-') argList[k] = argList[k].split('-')
                                        if (argList[k].charAt(0) == '*') argList[k] = argList[k].split('*')


                                    } else { // seperated by spaces
                                        if (argList[k].split(' ')[0] == 't' || argList[k].split(' ')[0] == 'cp' || argList[k].split(' ')[0] == 'da' || argList[k].split(' ')[0] == 'k' || argList[k].split(' ')[0] == 'p') { //arg type comes first (ex:  T Enact CP NGA CP Advantage CP Executive Order CP ConCon CP Amendment DA 2020 DA Court Packing CT DPT Bad)
                                            var splitUpArr = argList[k].split(' ')
                                            var finalArry = []
                                            var tempPushStr = ""
                                            for (j = 0; j < splitUpArr.length; j++) {
                                                if (splitUpArr[j] != 't' && splitUpArr[j] != 'cp' && splitUpArr[j] != 'da' && splitUpArr[j] != 'k' && splitUpArr[j] != 'p') { // if it is not an argument type, it has to be the name of an arg
                                                    tempPushStr += " " + splitUpArr[j]
                                                } else { //hit a arg type - save the string, push it into array, reset string

                                                    finalArry.push(tempPushStr)
                                                    tempPushStr = splitUpArr[j]

                                                }
                                            }
                                            finalArry.push(tempPushStr)
                                            argList[k] = finalArry
                                        }
                                        else if (argList[k].split(' ')[0].includes('-')) { //exception for  T-CJR T-Forensic Science T-Civil Courts CP Abolish the Senate CP Security K
                                            var splitUpArr = argList[k].split(' ')
                                            var finalArry = []
                                            var tempPushStr = ""
                                            for (j = 0; j < splitUpArr.length; j++) {
                                                if (splitUpArr[j].includes('-')) { // if it has a "-", meaning its something like T-CJR
                                                    finalArry.push(splitUpArr[j])
                                                } else if (splitUpArr[j] != 't' && splitUpArr[j] != 'cp' && splitUpArr[j] != 'da' && splitUpArr[j] != 'k' && splitUpArr[j] != 'p') { // if it is not an argument type, it has to be the name of an arg
                                                    // if ()
                                                    tempPushStr += " " + splitUpArr[j]
                                                } else { //hit a arg type - save the string, push it into array, reset string

                                                    finalArry.push(tempPushStr)
                                                    tempPushStr = splitUpArr[j]

                                                }

                                            }
                                            finalArry.push(tempPushStr)
                                            argList[k] = finalArry
                                        }
                                        else if (argList[k].split(' ')[0] != 't' && argList[k].split(' ')[0] != 'cp' && argList[k].split(' ')[0] != 'da' && argList[k].split(' ')[0] != 'k' && argList[k].split(' ')[0] != 'p') { // arg type at the end (ex: Black Futurity K)
                                            var splitUpArr = argList[k].split(' ')
                                            var finalArry = []
                                            var tempPushStr = ""
                                            for (j = 0; j < splitUpArr.length; j++) {
                                                if (splitUpArr[j] != 't' && splitUpArr[j] != 'cp' && splitUpArr[j] != 'da' && splitUpArr[j] != 'k' && splitUpArr[j] != 'p') { // if it is not an argument type, it has to be the name of an arg
                                                    tempPushStr += " " + splitUpArr[j]
                                                } else { //hit a arg type - save the string, push it into array, reset string

                                                    finalArry.push(tempPushStr)
                                                    tempPushStr = splitUpArr[j]

                                                }
                                            }
                                            finalArry.push(tempPushStr)
                                            argList[k] = finalArry
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // break;
            }

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