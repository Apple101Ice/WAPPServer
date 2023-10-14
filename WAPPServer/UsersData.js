const CONTACT_TYPE = { PERSON: "PERSON", GROUP: "GROUP" };

const users = [
    { userimage: null, contacttype: CONTACT_TYPE.PERSON, name: "Eugenia", mobile: "4163400287" },
    { userimage: null, contacttype: CONTACT_TYPE.PERSON, name: "Ricardo", mobile: "6187648723" },
    { userimage: null, contacttype: CONTACT_TYPE.PERSON, name: "Etta", mobile: "9316926010" },
    { userimage: null, contacttype: CONTACT_TYPE.PERSON, name: "Darrell", mobile: "5207119415" },
    { userimage: null, contacttype: CONTACT_TYPE.PERSON, name: "Shane", mobile: "7546827648" },
    { userimage: null, contacttype: CONTACT_TYPE.PERSON, name: "Justin", mobile: "8545665716" },
    { userimage: null, contacttype: CONTACT_TYPE.PERSON, name: "Mitchell", mobile: "4052819479" },
    { userimage: null, contacttype: CONTACT_TYPE.PERSON, name: "Isabelle", mobile: "1376956596" },
    { userimage: null, contacttype: CONTACT_TYPE.PERSON, name: "Brandon", mobile: "7723881631" },
    { userimage: null, contacttype: CONTACT_TYPE.PERSON, name: "Emma", mobile: "6238026737" },
];

const usersContact = users.map((user) => ({ mobile: user.mobile, contacts: [], memberof: [] }));

const usersGroup = [];

const chatLogsMap = {};

module.exports = { users, usersContact, usersGroup, chatLogsMap, CONTACT_TYPE };
