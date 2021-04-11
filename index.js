const express = require('express')
const { response } = require('express');
const cheerio = require('cheerio');
const superagent = require('superagent');
// const apiKey = require('./apiKeys.json')
const fs = require('fs')
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var parseString = require('xml2js').parseString;
var app = express()
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cookieParser())

/**
 * @todo tabroom entries to wiki links - // for tab to wiki entry matching: json file with entry school names with wiki links - if school name on tab = school name on wiki, the json entry is ""
 * @todo get all cites,  get all round reports
 */

app.post('/getpage', (req, resApp) => {

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


app.post('/cites', (req, resApp) => {

})

app.post('/roundreports', (req, resApp) => {
    console.log(req.body)
    superagent
        .get(req.body.link)
        .redirects(0)
        .end((err, res) => {
            var $ = cheerio.load(res.text)
            var roundData = null
            var returnArr = []
            for (i = 1; i < $('#tblReports').children('tbody').children('tr').length; i++) {
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
                } else if (argList[0].includes('1ac') && argList[0].length > 4) {
                    for (j = 0; j < argList.length; j++) {
                        tempArr = argList[j].split(' ')
                        roundData[tempArr[0]] = tempArr.slice(1).join(' ').trim()
                    }
                }
                if (roundData['1ac'] == "" && roundData['1nc'] == "" && roundData['2ac'] == "" && roundData['2nc'] == "" && roundData['1nr'] == "" && roundData['1ar'] == "" && roundData['2nr'] == "" && roundData['2ar'] == "") {

                } else {
                    returnArr.push(roundData)
                }
            }
            resApp.send(returnArr)
        })
})


app.post('/test', async (req, resApp) => {
    // superagent
    //     .get(`https://hspolicy.debatecoaches.org/rest/wikis/hspolicy20/spaces/College%20Prep/pages/Gu-Huang%20Aff/objects/Caselist.CitesClass/0/properties`)
    //     .end((err, res) => {
    //         parseString(Buffer.from(res.body).toString(), function (err1, parsed) {
    //             resApp.send(parsed)
    //         })
    //     })
    var a = {
        "number": "0",
        "entryDate": null,
        "judge": null,
        "opponent": null,
        "parentRound": null,
        "round": null,
        "entryTitle": null,
        "tournament": null,
        "text": "Plan—1AC\nPlan: The United States federal government should establish a mandatory minimum sentence for corporate espionage. \nAdvtg 1\nChinese espionage increasing now~-~--only criminal punishment solves\nCatherine Dunn, 9-21-2018, \"Philly’s U.S. attorney pursuing corporate espionage and white collar crime with ‘100 percent support’ from Jeff Sessions,\" https://www.inquirer, https://www.inquirer.com/philly/business/phillys-u-s-attorney-espionage-trade-secrets-china-jeff-sessions-20180921.html//rLiu\n\nScenario 1 is the Space Race\n\nCorporate espionage crime is a huge danger and empowers Russian-Chinese great power competition – deterring US employees from switching sides and ensuring maximum security is key\nStratfor, 11-5-2019, \"An Era of Unparalleled Espionage Risk Is Upon Us,\" https://worldview.stratfor.com/article/era-unparalleled-corporate-espionage-risk-upon-us-security-cybersecurity-threat//rLiu\nSpecifically, corporate espionage wins China the space race\nNicholas Eftimiades, 7-8-2020, \"The Impact of Chinese Espionage on the United States,\" The Diplomat, https://thediplomat.com/2018/12/the-impact-of-chinese-espionage-on-the-united-states//rLiu\nThe space race is key to hegemony – losing it would guarantee Chinese domination of the world and space, but protecting US intellectual property can solve\nGreg Autry, Steve Kwast, 12-8-2018, \"America Is Losing the Second Space Race to China,\" Foreign Policy, https://foreignpolicy.com/2019/08/22/america-is-losing-the-second-space-race-to-china//rLiu\nThe militarization of space is key to global power projection. \nElbridge Colby 16. Robert M. Gates Senior Fellow at the Center for a New American Security (CNAS). Previously he served for over five years in the U.S. government, primarily in positions focusing on nuclear weapons, arms control, and intelligence reform. He has also served as a staff member or advisor to several governmental commissions, including the 2009 Congressional Strategic Posture Commission and the 2014 National Defense Panel, and serves as a consultant to a variety of U.S. government entities on a range of defense and intelligence matters. “FROM SANCTUARY TO BATTLEFIELD: A Framework for a U.S. Defense and Deterrence Strategy for Space”. https://www.files.ethz.ch/isn/195913/CNAS20Space20Report_16107.pdf.//*recut by rLiu\nChinese hegemony causes war in the SCS and ECS—even low-level conflicts escalate to nuclear war\nO’Hanlon and Poling 20 Michael O’Hanlon, senior fellow and director of research in Foreign Policy at the Brookings Institution, author of The Senkaku Paradox: Risking Great Power War Over Small Stakes, Gregory Poling, senior fellow for Southeast Asia and director of the Asia Maritime Transparency Initiative at CSIS, “ROCKS, REEFS, AND NUCLEAR WAR,” Asia Maritime Transparency Initiative, 1/14/2020, https://amti.csis.org/rocks-reefs-and-nuclear-war/\nScenario 2 is Business Innovation\nIndependently, China is targeting the US energy sector~-~--discouraging energy innovation.\nHunt 19 – Sarah Hunt is a leader in conservative clean energy policy and a successful social entrepreneur. As co-founder and CEO of the Joseph Rainey Center for Public Policy.\n(Sarah Hunt, 2019, “Chinese Energy Innovation Espionage: What’s at stake and what we can do about it?,” Protego Press, https://protegopress.com/chinese-energy-innovation-espionage/.)\nClean energy innovation is key to solving climate change.\nUS DOE 20 – US Department of Energy is a cabinet-level department of the United States Government concerned with the United States' policies regarding energy and safety in handling nuclear material.\n(US DOE, 2020, “What is Mission Innovation?,” US Department of Energy, https://www.energy.gov/what-mission-innovation.)\nWarming causes extinction—CO2 feedback loops, water scarcity, and natural disasters\nKareiva and Carranza 18 Peter Kareiva, PhD, Director of the Institute of the Environment and Sustainability at UCLA, Pritzker Distinguished Professor in Environment and Sustainability at UCLA, Valerie Carranza, PhD student, September 2018, “Existential Risk Due To Ecosystem Collapse: Nature Strikes Back,” Futures, Vol. 102, https://doi.org/10.1016/j.futures.2018.01.001\nEconomic decline causes great power war – nuclear deterrence isn’t enough \nStein Tønnesson 8-20-15 (Tønnesson is a research professor (PRIO) and adjunct professor at the Department of Peace and Conflict Research, Uppsala University. “Deterrence, interdependence and Sino–US peace,” pg. 309-310, International Area Studies Review, https://journals-sagepub-com.dartmouth.idm.oclc.org/doi/10.1177/2233865915596660 //KDCC)\nAdvtg 2\nCorporate espionage escalates US-China tensions, especially fueling the trade war~-~--Covid exacerbates.\nWu 8/6 – Chu Wu is an International Broadcaster (Multimedia) (Mandarin) at VOA News.\n(Chu Wu, August 6, 2020, “Tensions Mount over China’s Industrial Espionage in US,” Voice of America News, https://www.voanews.com/east-asia-pacific/voa-news-china/tensions-mount-over-chinas-industrial-espionage-us.)\nAn end to trade secret theft ends the trade war.\nYeung and Leng 19 – Karen Yeung joined the Post in 2017 after more than 15 years' experience on global newswires in Hong Kong and Shanghai. She spent eight years in Shanghai and has received awards for best feature, analysis and agenda-setting. Sidney Leng joined the Post in 2015 after spending a year and a half working for US media, including National Public Radio and Foreign Policy Magazine. He has been covering China's macroeconomic policies and financial regulations since 2016.\n(Karen Yeung and Sidney Leng, February 25, 2019, “Can China Meet US Trade War Demands On IP Theft And Forced Technology Transfer?,” South China Morning Post, https://www.scmp.com/economy/china-economy/article/2187312/us-china-trade-war-can-china-meet-us-demands-ip-theft-and.)\nThe trade war collapses the US manufacturing sector~-~--it’s stalled in the status quo.\nSwanson and Smialek 1/3 – Ana Swanson reported from Washington, and Jeanna Smialek from San Diego. Alan Rappeport contributed reporting from Washington, and Peter Eavis and Matt Phillips from New York. She is based in the Washington bureau and covers trade and international economics for The New York Times. She previously worked at The Washington Post, where she wrote about trade, the Federal Reserve and the economy. Jeanna Smialek writes about the Federal Reserve and the economy for The New York Times. She previously covered economics at Bloomberg News, where she also wrote feature stories for Businessweek magazine.\nThe manufacturing sector is key to economic growth. AND, the industry is not at its worst but getting worse because of the trade war. \nHopkins 1/6 – Christopher A. Hopkins, CFA, is a vice president and portfolio manager for Barnett and Co. in Chattanooga.\n(Christopher A. Hopkins, January 6, 2020, “Personal Finance: Manufacturing Remains a Key to US Economy,” Chattanooga Times Free Press, https://www.timesfreepress.com/news/business/aroundregion/story/2020/jan/06/manufacturing-remains-key-us-economy/512329/.)\nFor the fifth month on a row, U.S. industrial production contracted in December reflecting a number of challenges including trade tensions, dollar strength and a general slowdown in global production. The Institute for Supply Management monthly gauge of factory activity fell to 47.2 for the final month of 2019, the lowest reading since June 2009. The ISM measure is a \"diffusion index,\" calibrated such that a level of 50 is neutral. \nEconomic decline causes great power war – nuclear deterrence isn’t enough \nStein Tønnesson 8-20-15 (Tønnesson is a research professor (PRIO) and adjunct professor at the Department of Peace and Conflict Research, Uppsala University. “Deterrence, interdependence and Sino–US peace,” pg. 309-310, International Area Studies Review, https://journals-sagepub-com.dartmouth.idm.oclc.org/doi/10.1177/2233865915596660 //KDCC)\nSolvency—1AC\nMandatory minimums for corporate espionage are necessary to deter trade secret theft—civil penalties alone are insufficient\nByrdsong 15 Danielle K Byrdsong, JD candidate, “Keeping the Best Kept Secrets: Mandatory Minimum Sentencing for Trade Secret Theft Under the Economic Espionage Act,” New England Journal on Criminal and Civil Confinement 41, no. 2, Spring 2015, https://heinonline.org/HOL/LandingPage?handle=hein.journals/nejccc41anddiv=27andid=andpage=//cb\nLegislative branch is best to define and grade crimes – critical to countering white-collar crime\nBaer 19 (Meriam, visiting professor of law @ Yale, December 2019, “Sorting Out White-Collar Crime” Texas Law Review – Volume 97 – Issue 2, https://texaslawreview.org/sorting-out-white-collar-crime/)",
        "roundReport": null,
        "propertyLink": "https://hspolicy.debatecoaches.org/rest/wikis/hspolicy20/spaces/College%20Prep/pages/Gu-Huang%20Aff/objects/Caselist.CitesClass/0/properties"
    }



    console.log(await getProp(a))
    async function getProp(entryObj) {
        return new Promise(async (resolve, reject) => {
            var internalObj = entryObj
            console.log("wave")
            console.log(internalObj)
            console.log(entryObj.propertyLink)
            superagent
                .get(entryObj.propertyLink)
                .end((err, res) => {
                    parseString(Buffer.from(res.body).toString(), function (parseErr, parsed) {
                        // internalObj.entryDate = 
                        for (i = 0; i < parsed.properties.property.length; i++) {
                            switch (parsed.properties.property[i].$.name) {
                                case 'EntryDate':
                                    internalObj.entryDate = parsed.properties.property[i].value[0]
                                case 'Judge':
                                    internalObj.judge = parsed.properties.property[i].value[0]
                                case 'Opponent':
                                    internalObj.opponent = parsed.properties.property[i].value[0]
                                case 'Round':
                                    internalObj.round = parsed.properties.property[i].value[0]
                                case 'RoundReport':
                                    internalObj.roundReport = parsed.properties.property[i].value[0]
                                case 'ParentRound':
                                    internalObj.parentRound = parsed.properties.property[i].value[0]
                                case 'Title':
                                    internalObj.entryTitle = parsed.properties.property[i].value[0]
                                case 'RoundReport':
                                    internalObj.roundReport = parsed.properties.property[i].value[0]
                                case 'Tournament':
                                    internalObj.tournament = parsed.properties.property[i].value[0]
                            }
                        }
                        resolve(internalObj)

                    })
                })
        })

    }
})

app.post('/latestEntry', async (req, resApp) => {

    var reqLink = req.body.link.replace('https://hspolicy.debatecoaches.org/', "").split('/')
    reqLink = `https://hspolicy.debatecoaches.org/rest/wikis/hspolicy20/spaces/${reqLink[0]}/pages/${reqLink[1]}/objects` // this has to change every year :( cause of the hspolicy20 thing

    // var reqLink = `https://hspolicy.debatecoaches.org/rest/wikis/hspolicy20/spaces/College%20Prep/pages/Gu-Huang%20Aff/objects`
    superagent
        .get(reqLink)
        .end(async (err, res) => {
            parseString(Buffer.from(res.body).toString(), async function (parseErr, parsed) {
                var entryList = []

                entryList = await setupProp(parsed)

                entryList = await Promise.all(
                    entryList.map(async (currentValue) => {
                        return (await getProp(currentValue))
                    })
                )

                entryList = await mergeEntries(entryList)
                resApp.send(entryList)

                async function mergeEntries(entryList) {
                    return new Promise(async (resolve, reject) => {
                        for (i = 0; i < entryList.length; i++) {
                            for (j = 0; j < entryList.length; j++) {
                                if ((entryList[i].number === entryList[j].number) && (i != j)) { // match - we have a duplicate, one has a cite, the other one does not
                                    if (entryList[i].propertyLink.includes('CitesClass')) { // i has more info (delete j)
                                        entryList.splice(j, 1)
                                    } else if (entryList[j].propertyLink.includes('CitesClass')) { // j has more info (delete i)
                                        entryList.splice(i, 1)
                                    }
                                }
                            }
                        }
                        resolve(entryList)
                    })
                }

                async function getProp(entryObj) {
                    return new Promise(async (resolve, reject) => {
                        var internalObj = entryObj
                        superagent
                            .get(entryObj.propertyLink)
                            .end((err, res) => {
                                parseString(Buffer.from(res.body).toString(), function (parseErr, parsed) {

                                    for (i = 0; i < parsed.properties.property.length; i++) {
                                        switch (parsed.properties.property[i].$.name) {
                                            case 'EntryDate':
                                                internalObj.entryDate = parsed.properties.property[i].value[0]
                                            case 'Judge':
                                                internalObj.judge = parsed.properties.property[i].value[0]
                                            case 'Opponent':
                                                internalObj.opponent = parsed.properties.property[i].value[0]
                                            case 'Round':
                                                internalObj.round = parsed.properties.property[i].value[0]
                                            case 'RoundReport':
                                                internalObj.roundReport = parsed.properties.property[i].value[0]
                                            case 'ParentRound':
                                                internalObj.parentRound = parsed.properties.property[i].value[0]
                                            case 'Title':
                                                internalObj.entryTitle = parsed.properties.property[i].value[0]
                                            case 'RoundReport':
                                                internalObj.roundReport = parsed.properties.property[i].value[0]
                                            case 'Tournament':
                                                internalObj.tournament = parsed.properties.property[i].value[0]
                                        }
                                    }
                                    resolve(internalObj)

                                })
                            })
                    })
                }
            })

        })

    async function setupProp(parsed) {
        return new Promise(async (resolve, reject) => {
            var entryList = []
            var entryObj;
            for (i = 0; i < parsed.objects.objectSummary.length; i++) {
                entryObj = {
                    "number": null, // check
                    "entryDate": null, //ok
                    "judge": null, //ok
                    "opponent": null, //ok
                    "parentRound": null, //ok
                    "round": null, //ok
                    "entryTitle": null, //ok
                    "tournament": null, //ok
                    "text": null, // check aka cites
                    "roundReport": null,
                    "propertyLink": null // check
                }
                entryObj.number = parsed.objects.objectSummary[i].number[0]
                entryObj.propertyLink = parsed.objects.objectSummary[i].link[1].$.href
                if (parsed.objects.objectSummary[i].headline[0].length > 4) {
                    entryObj.text = parsed.objects.objectSummary[i].headline[0]
                }

                entryList.push(entryObj)
            }

            resolve(entryList)

        })

    }


})




app.post('/roundreportssort', (req, resApp) => {
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

app.post('/test', (req, resApp) => {
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