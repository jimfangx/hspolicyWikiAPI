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
    console.log(req.body)
    var schoolSearchString = req.body.school
    schoolSearchString = schoolSearchString.replace('High School', "").trim()
    var competitorSearchString = req.body.entry.replace(' & ', "-")

    console.log(encodeURIComponent(schoolSearchString))

    superagent
        .get(`https://hspolicy.debatecoaches.org/${encodeURIComponent(schoolSearchString)}/`) // ex .get('https://hspolicy.debatecoaches.org/Bronx%20Science/')
        .redirects(2)
        .end((err, res) => {

            if (res.text.includes('Were you looking for one of the following pages instead')) { // wrong name - click on the first link with hspolicy header
                var $ = cheerio.load(res.text)
                var correctSchoolLink = ""
                for (i = 0; i < $('.centered.panel', '#mainContentArea').children('.panel-body').children('div').children('ul').children('li').length; i++) {
                    if ($($('.centered.panel', '#mainContentArea').children('.panel-body').children('div').children('ul').children('li')[0]).children('a')[0].attribs.href.includes('hspolicy')) {
                        correctSchoolLink = $($('.centered.panel', '#mainContentArea').children('.panel-body').children('div').children('ul').children('li')[0]).children('a')[0].attribs.href
                        break;
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
                    if ($('#tblTeams').children('tbody').children('tr').length > 1) {
                        for (i = 1; i < $('#tblTeams').children('tbody').children('tr').length; i++) { // start from 1 due to sortHeader

                            if ($($($('#tblTeams').children('tbody').children('tr')[i]).children('td')[1]).children('span').children('a').text().replace('Aff', "") === competitorSearchString) { //td[0] looks at the aff page column // Find the team on the team page on the wiki
                                // team found! - gather links
                            } 
                            break;
                        }
                    }
                })
            // check either aff column or neg column against the competitor entry names - if match, copy a tag href - if no matches at the end of the first run, switch the compeitor names and check again. if empty after both runs - return no wiki (1 person in the partership has a wiki support coming later)
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