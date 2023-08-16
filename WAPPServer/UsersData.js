const CONTACT_TYPE = { PERSON: 'PERSON', GROUP: 'GROUP' };

const users = [
    { id: 1, contactType: CONTACT_TYPE.PERSON, name: "Eugenia", mobile: 4163400287 },
    { id: 2, contactType: CONTACT_TYPE.PERSON, name: "Ricardo", mobile: 6187648723 },
    { id: 3, contactType: CONTACT_TYPE.PERSON, name: "Etta", mobile: 9316926010 },
    { id: 4, contactType: CONTACT_TYPE.PERSON, name: "Darrell", mobile: 5207119415 },
    { id: 5, contactType: CONTACT_TYPE.PERSON, name: "Shane", mobile: 7546827648 },
    { id: 6, contactType: CONTACT_TYPE.PERSON, name: "Justin", mobile: 8545665716 },
    { id: 7, contactType: CONTACT_TYPE.PERSON, name: "Mitchell", mobile: 4052819479 },
    { id: 8, contactType: CONTACT_TYPE.PERSON, name: "Isabelle", mobile: 1376956596 },
    { id: 9, contactType: CONTACT_TYPE.PERSON, name: "Brandon", mobile: 7723881631 },
    { id: 10, contactType: CONTACT_TYPE.PERSON, name: "Emma", mobile: 6238026737 },
];

const usersContact = [
    {
        id: 1,
        mobile: 6238026737,
        contacts: [
            { id: 1, contactType: CONTACT_TYPE.PERSON, name: "Brandon", mobile: 7723881631 },
            { id: 2, contactType: CONTACT_TYPE.PERSON, name: "Justin", mobile: 8545665716 },
            { id: 3, contactType: CONTACT_TYPE.PERSON, name: "Darrell", mobile: 5207119415 },
        ],
        memberOf: [],
    },
    {
        id: 2,
        mobile: 7723881631,
        contacts: [
            { id: 1, contactType: CONTACT_TYPE.PERSON, name: "Emma", mobile: 6238026737 },
            { id: 2, contactType: CONTACT_TYPE.PERSON, name: "Shane", mobile: 7546827648 },
            { id: 3, contactType: CONTACT_TYPE.PERSON, name: "Ricardo", mobile: 6187648723 },
        ],
        memberOf: [],
    },
    {
        id: 3,
        mobile: 7546827648,
        contacts: [
            { id: 1, contactType: CONTACT_TYPE.PERSON, name: "Brandon", mobile: 7723881631 },
            { id: 2, contactType: CONTACT_TYPE.PERSON, name: "Justin", mobile: 8545665716 },
            { id: 3, contactType: CONTACT_TYPE.PERSON, name: "Darrell", mobile: 5207119415 },
        ],
        memberOf: [],
    },
    {
        id: 4,
        mobile: 6187648723,
        contacts: [
            { id: 1, contactType: CONTACT_TYPE.PERSON, name: "Isabelle", mobile: 1376956596 },
            { id: 2, contactType: CONTACT_TYPE.PERSON, name: "Justin", mobile: 8545665716 },
            { id: 3, contactType: CONTACT_TYPE.PERSON, name: "Darrell", mobile: 5207119415 },
        ],
        memberOf: [],
    },
    {
        id: 5,
        mobile: 8545665716,
        contacts: [
            { id: 1, contactType: CONTACT_TYPE.PERSON, name: "Isabelle", mobile: 1376956596 },
            { id: 2, contactType: CONTACT_TYPE.PERSON, name: "Brandon", mobile: 7723881631 },
            { id: 3, contactType: CONTACT_TYPE.PERSON, name: "Darrell", mobile: 5207119415 },
            { id: 4, contactType: CONTACT_TYPE.PERSON, name: "Emma", mobile: 6238026737 },
            { id: 5, contactType: CONTACT_TYPE.PERSON, name: "Mitchell", mobile: 4052819479 },
        ],
        memberOf: [],
    },
];


const usersGroup = []

const chatLogsMap = {};

module.exports = { users, usersContact, usersGroup, chatLogsMap, CONTACT_TYPE };
