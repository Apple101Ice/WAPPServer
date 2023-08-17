const express = require("express");
const WebSocket = require("ws");
const http = require("http");
const passport = require("passport");
const passportJWT = require("passport-jwt");
const JWTStrategy = passportJWT.Strategy;
const ExtractJWT = passportJWT.ExtractJwt;
const cors = require("cors");
const jwt = require("jsonwebtoken");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = new Map();

const { users, usersContact, usersGroup, chatLogsMap, CONTACT_TYPE } = require("./UsersData");

const secretKey = "your-secret-key";

passport.use(
    new JWTStrategy(
        {
            jwtFromRequest: ExtractJWT.fromAuthHeaderAsBearerToken(),
            secretOrKey: secretKey,
        },
        (jwtPayload, done) => {
            const user = { id: jwtPayload.id, username: jwtPayload.username };
            return done(null, user);
        }
    )
);

app.use(passport.initialize());

app.use(cors());

app.use(express.json());

const generateToken = (user) => {
    const payload = { id: user.id, username: user.username };
    return jwt.sign(payload, secretKey, { expiresIn: "7d" });
};

const broadcastMessageToClient = (recipient, message) => {

    if (recipient.readyState === WebSocket.OPEN) {
        recipient.send(message);
    }
};


const findWebSocketConnectionByClientId = (clientId) => {
    let recipient = null;

    clients.forEach((client, ws) => {
        if (client === clientId) {
            recipient = ws;
        }
    });

    return recipient;
};

wss.on("connection", (ws) => {
    let clientId;

    const sendMessageToClient = (client, messageType) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ message: messageType }));
        }
    };

    ws.on("message", async (data) => {
        const messageData = JSON.parse(data);
        const { messageFrom, senderName, messageTo, messageType, messageContent, memberOf } = messageData;

        if (messageType === "SETNAME") {
            clients.set(ws, messageContent);
            clientId = messageContent;
            console.log("Client connected", messageContent);
        } else if (messageType === CONTACT_TYPE.PERSON) {
            if (messageFrom && messageTo) {
                const senderId = clients.get(ws);

                if (senderId === messageFrom) {
                    const message = { messageId: generateUniqueId(), messageFrom, senderName, messageTo, groupMessage: false, text: messageContent, timestamp: Date.now() };
                    const key1 = `${messageFrom}_${messageTo}_person`;
                    const key2 = `${messageTo}_${messageFrom}_person`;

                    chatLogsMap[key1] = chatLogsMap[key1] || [];
                    chatLogsMap[key2] = chatLogsMap[key2] || [];

                    chatLogsMap[key1].push(message);
                    chatLogsMap[key2].push(message);

                    clients.forEach((client, id) => {
                        if (client === messageTo || client === ws) {
                            sendMessageToClient(id, "PERSON");
                        }
                    });
                } else {
                    console.log("Received a text message from an unauthorized client.");
                }
            } else {
                console.log("Received a text message with missing sender or receiver information.");
            }
        } else if (messageType === CONTACT_TYPE.GROUP) {
            if (!memberOf || !memberOf.id || !memberOf.name || !memberOf.mobile) {
                console.log("Received a group message with missing group information.");
                return;
            }

            const message = { messageId: generateUniqueId(), messageFrom, senderName, messageTo, groupMessage: true, text: messageContent, timestamp: Date.now() };
            const key1 = `${messageTo}_${memberOf.id}_${memberOf.name}_group`;



            chatLogsMap[key1] = chatLogsMap[key1] || [];


            chatLogsMap[key1].push(message);


            const chatGroup = usersGroup.find((group) => group.id === +memberOf.id && group.name === memberOf.name && group.mobile === parseInt(memberOf.mobile));

            if (chatGroup) {
                chatGroup.members.forEach((member) => {
                    const recipient = findWebSocketConnectionByClientId(member.mobile);
                    if (recipient) {
                        sendMessageToClient(recipient, "GROUP");
                    }
                });
            } else {
                console.log("Group not found in usersGroup.");
            }
        } else {
            console.log("Received an unknown message type from the client.");
        }
    });

    ws.on("close", () => {
        if (clientId) {
            console.log(`Client with ID ${clientId} disconnected`);
            clients.delete(ws);
        }
    });
});

app.get("/chatlog/:messageFrom/:messageTo", passport.authenticate("jwt", { session: false }), (req, res) => {
    const { messageFrom, messageTo } = req.params;
    const key = `${messageFrom}_${messageTo}_person`;
    const chatLogs = chatLogsMap[key] || [];

    res.json(chatLogs);
});

app.get("/groupchatlog/:messageTo/:id/:groupname", passport.authenticate("jwt", { session: false }), (req, res) => {
    const { messageTo, id, groupname } = req.params;
    console.log(req.params);
    const key = `${messageTo}_${id}_${groupname}_group`;
    const chatLogs = chatLogsMap[key] || [];

    res.json(chatLogs);
});

app.post("/login", (req, res) => {
    const { mobile = "" } = req.body;

    const user = users.find((u1) => u1.mobile === +mobile);

    if (user) {
        const token = generateToken(user);
        res.json({ token, user });
    } else {
        res.status(404).json("No user found. Please Register");
    }
});

app.post("/register", (req, res) => {
    const { name, mobile } = req.body;

    if (!name || isNaN(mobile)) {
        return res.status(400).json("Please Enter Proper Details.");
    }

    const isMobileRegistered = users.some((user) => user.mobile === +mobile);
    if (isMobileRegistered) {
        return res.status(409).json("Mobile Number is already registered.");
    }

    const lastIndex = users.reduce((acc, curr) => (acc < curr.id ? curr.id : acc), 0);
    const newId = lastIndex + 1;

    const newUser = { id: newId, contactType: CONTACT_TYPE.PERSON, name, mobile: +mobile };

    users.push(newUser);

    res.status(200).json("Registered Successfully.");
});

app.get("/protected", passport.authenticate("jwt", { session: false }), (req, res) => {
    res.json({ message: "This is a protected route." });
});

app.post("/addcontact/:usermobile", passport.authenticate("jwt", { session: false }), (req, res) => {
    const { usermobile } = req.params;
    const { mobile } = req.body;

    if (isNaN(mobile)) {
        return res.status(400).json("Please Enter a Proper Number");
    }

    const registeredUser = users.find((user) => user.mobile === +mobile);

    if (!registeredUser) {
        return res.status(404).json("Number is not registered.");
    }

    if (registeredUser.mobile === +usermobile) {
        return res.status(400).json("You cannot add your own number.");
    }

    const userContact = usersContact.find((contact) => contact.mobile === +usermobile);

    if (!userContact) {
        return res.status(404).json("User contact not found.");
    }

    const contactExist = userContact.contacts.find((contact) => contact.mobile === +mobile);

    if (contactExist) {
        return res.status(400).json("Number already in your contact.");
    }

    const lastContact = userContact.contacts.reduce((acc, curr) => (curr.id > acc ? curr.id : acc), 0);
    const newId = lastContact + 1;

    const newContact = { id: newId, ...registeredUser };

    userContact.contacts.push(newContact);

    res.status(200).json('New contact added successfully');
});

app.delete("/deletecontact/:usermobile", passport.authenticate("jwt", { session: false }), (req, res) => {
    const { usermobile } = req.params;
    const { mobile } = req.body;

    const userContact = usersContact.find((contact) => contact.mobile === +usermobile);

    if (!userContact) {
        return res.status(404).json("User contact not found.");
    }

    const deleteIndex = userContact.contacts.findIndex((contact) => contact.mobile === +mobile);

    if (deleteIndex === -1) {
        return res.status(404).json("Contact not found.");
    }

    userContact.contacts.splice(deleteIndex, 1);

    return res.status(200).json('Contact deleted successfully');
});

app.get("/usercontact/:mobile", passport.authenticate("jwt", { session: false }), (req, res) => {
    const { mobile } = req.params;
    const userContact = usersContact.find((contact) => contact.mobile === Number(mobile));

    const userGroup = usersGroup.filter((group) => group.mobile === +mobile) || [];

    if (userContact) {
        res.json({ userContact, userGroup });
    } else {
        res.status(404).json("No user contact found for the given mobile number");
    }
});

app.put("/edituser/:usermobile", passport.authenticate("jwt", { session: false }), (req, res) => {
    const { usermobile } = req.params;
    const { editName } = req.body;
    const tempUser = users.find((user) => user.mobile === +usermobile);

    if (tempUser) {
        tempUser.name = editName;
        res.status(200).json(tempUser);
    } else {
        res.status(400).json('User not found');
    }

});

app.post("/creategroup/:usermobile", passport.authenticate("jwt", { session: false }), (req, res) => {
    const { usermobile } = req.params;
    const { groupName, members } = req.body;

    const groupAdmin = users.find((user) => user.mobile === +usermobile);

    const newGroupId = Math.max(...usersGroup.map((group) => group.id), 0) + 1;

    const newGroup = { id: newGroupId, contactType: CONTACT_TYPE.GROUP, mobile: parseInt(usermobile), name: groupName, adminName: groupAdmin.name, members: [groupAdmin, ...members] };



    usersGroup.push(newGroup);


    members.forEach((member) => {

        const userContactIndex = usersContact.findIndex((contact) => contact.mobile === member.mobile);

        if (userContactIndex !== -1) {
            usersContact[userContactIndex].memberOf.push(newGroup);
        }

        const recipient = findWebSocketConnectionByClientId(member.mobile);
        if (recipient) {
            broadcastMessageToClient(recipient, JSON.stringify({ messageType: "updateGroup" }));
        }
    });

    res.status(201).json('Group created successfully.');
});

app.post("/updategroup/:groupid/:usermobile/:groupname", passport.authenticate("jwt", { session: false }), (req, res) => {
    const { groupid, groupname, usermobile } = req.params;
    const { member } = req.body;

    const groupToUpdate = usersGroup.find(group =>
        group.id === +groupid &&
        group.name === groupname &&
        group.mobile === +usermobile
    );

    if (groupToUpdate) {
        const memberIndex = groupToUpdate.members.findIndex(temp => temp.mobile === +member.mobile);

        if (memberIndex >= 0) {
            groupToUpdate.members.splice(memberIndex, 1);
        } else {
            groupToUpdate.members.push(member);
        }

        res.status(200).json(groupToUpdate);
    } else {
        res.status(404).json('Group not found');
    }
});

app.delete("/deletegroup/:groupmobile", passport.authenticate("jwt", { session: false }), handleGroupDeletion);

function handleGroupDeletion(req, res) {
    const { groupmobile } = req.params;
    const { groupdata } = req.body;

    const delGroupIndex = usersGroup.findIndex((group) => group.id === +groupdata.id && group.mobile === parseInt(groupdata.mobile));

    if (delGroupIndex === -1) {
        return res.status(404).json('No group found.');
    }

    const groupToDelete = usersGroup[delGroupIndex];

    if (groupToDelete.mobile !== parseInt(groupmobile)) {
        return res.status(401).json('Only an Admin can delete this group.');
    }

    const membersToDelete = groupToDelete.members;

    membersToDelete.forEach((member) => {
        handleMemberDeletion(member);
    });

    usersGroup.splice(delGroupIndex, 1);
    res.status(200).json('Group deleted successfully.');
}

function handleMemberDeletion(member) {
    try {
        const userContactIndex = usersContact.findIndex((contact) => contact.mobile === member.mobile);

        if (userContactIndex !== -1) {
            const memberGroups = usersContact[userContactIndex].memberOf;
            const groupIndex = memberGroups.findIndex((group) => group.id === member.id && group.mobile === member.mobile);

            if (groupIndex !== -1) {
                memberGroups.splice(groupIndex, 1);
            }
        }

        const recipient = findWebSocketConnectionByClientId(member.mobile);
        if (recipient) {
            broadcastMessageToClient(recipient, JSON.stringify({ messageType: "updateGroup" }));
        }
    } catch (error) {

    }
}

function generateUniqueId() {
    const randomPart = Math.random().toString(36).substr(2, 9);
    const timestampPart = new Date().getTime().toString(36);
    const uniqueId = randomPart + timestampPart;
    return uniqueId;
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
