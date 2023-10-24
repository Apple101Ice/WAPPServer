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

const { CONTACT_TYPE } = require("./UsersData");
const {
    testDatabaseConnection,
    initializeDatabase,
    getTableData,
    insertData,
    insertChatMedia,
    deleteChatMedia,
    getChatData,
    getGroupChatData,
    updateData,
    deleteGroup,
    resetDatabase,
    TABLES_NAME,
} = require("./db");

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

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

app.use(express.json());

const MESSAGE_TYPE = {
    SETNAME: "SETNAME",
    PERSON: "PERSON",
    GROUP: "GROUP",
    UPDATECONTACT: "UPDATECONTACT",
};

const delay = 0;

const generateToken = (user) => {
    const payload = { id: user.id, name: user.name, mobile: user.mobile };
    return jwt.sign(payload, secretKey, { expiresIn: "7d" });
};

const broadcastmessagetoClient = (recipient, message) => {
    if (recipient.readyState === WebSocket.OPEN) {
        recipient.send(message);
    }
};

const findWebSocketConnectionByClientId = (clientId) => {
    return Array.from(clients.entries()).find(
        ([ws, client]) => client === clientId
    )?.[0];
};

wss.on("connection", (ws) => {
    let clientId;

    const sendmessagetoClient = (client, messagetype) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ message: messagetype }));
        }
    };

    ws.on("message", async (data) => {
        const {
            sendername,
            receivername,
            sender,
            receiver,
            messagetype,
            fileinfo,
            fileData,
            messagecontent,
            memberof,
        } = JSON.parse(data);

        if (messagetype === MESSAGE_TYPE.SETNAME) {
            clients.set(ws, messagecontent);
            clientId = messagecontent;
        } else if (messagetype === MESSAGE_TYPE.PERSON) {
            if (sender && receiver) {
                const senderId = clients.get(ws);

                if (senderId === sender) {
                    const message = {
                        sendername,
                        receivername,
                        sender,
                        receiver,
                        groupmessage: false,
                        chatmessage: messagecontent,
                        timestamp: Date.now(),
                    };

                    let binaryData = null;

                    if (fileData) {
                        binaryData = Buffer.from(fileData, "base64");
                    }

                    const uniqueid = generateUniqueId();

                    await insertChatMedia(uniqueid, message, fileinfo, binaryData);

                    [sender, receiver].forEach((member) => {
                        const recipient = findWebSocketConnectionByClientId(member);
                        if (recipient) {
                            sendmessagetoClient(recipient, MESSAGE_TYPE.PERSON);
                        }
                    });
                } else {
                    console.log("Received a text message from an unauthorized client.");
                }
            } else {
                console.log(
                    "Received a text message with missing sender or receiver information."
                );
            }
        } else if (messagetype === MESSAGE_TYPE.GROUP) {
            if (!memberof.uniqueid) {
                console.log("Received a group message with missing group information.");
                return;
            }

            const message = {
                sendername,
                receivername,
                sender,
                receiver,
                groupmessage: true,
                groupuniqueid: memberof.uniqueid,
                chatmessage: messagecontent,
                timestamp: Date.now(),
            };

            let binaryData = null;

            if (fileData) {
                binaryData = Buffer.from(fileData, "base64");
            }

            const uniqueid = generateUniqueId();

            await insertChatMedia(uniqueid, message, fileinfo, binaryData);

            const usersGroup = (await getTableData(TABLES_NAME.TABLE_USERSGROUP))
                .rows;

            const chatGroup = usersGroup.find(
                (group) => group.uniqueid === memberof.uniqueid
            );

            if (chatGroup) {
                chatGroup.members.forEach((member) => {
                    const recipient = findWebSocketConnectionByClientId(member.mobile);
                    if (recipient) {
                        sendmessagetoClient(recipient, MESSAGE_TYPE.GROUP);
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

app.get(
    "/chatlog/:sender/:receiver",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        try {
            const { sender, receiver } = req.params;

            const result = await getChatData(sender, receiver);

            setTimeout(() => {
                res.json(result.rows);
            }, delay);
        } catch (error) {
            console.error("Error getting group chat log:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

app.get(
    "/groupchatlog",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        try {
            const { groupuniqueid } = req.query;
            const result = await getGroupChatData(groupuniqueid);
            setTimeout(() => {
                res.json(result.rows);
            }, delay);
        } catch (error) {
            console.error("Error getting group chat log:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
);

app.post(
    "/deletechat",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const {
            uniqueid,
            sender,
            receiver,
            isgroup = false,
            groupuniqueid,
        } = req.body;

        const message = isgroup ? MESSAGE_TYPE.GROUP : MESSAGE_TYPE.PERSON;

        deleteChatMedia(uniqueid)
            .then(async () => {
                res.json({ message: "Chat deleted Successfully." });

                let members = [];

                if (isgroup) {
                    const usersGroup = (await getTableData(TABLES_NAME.TABLE_USERSGROUP))
                        .rows;

                    const currentgroup = usersGroup.find(
                        (group) => group.uniqueid === groupuniqueid
                    );
                    members = currentgroup.members.map((member) => member.mobile);
                } else {
                    members = [sender, receiver];
                }

                members.forEach((number) => {
                    const recipient = findWebSocketConnectionByClientId(number);
                    if (recipient) {
                        broadcastmessagetoClient(
                            recipient,
                            JSON.stringify({ message: message })
                        );
                    }
                });
            })
            .catch((error) => {
                console.error("Error deleting chat media:", error);
                res.status(500).json({ error: "Internal server error" });
            });
    }
);

app.post("/login", async (req, res) => {
    const { mobile = "" } = req.body;
    try {
        const users = (await getTableData(TABLES_NAME.TABLE_USERS)).rows;

        const user = users.find((u1) => u1.mobile === mobile);

        if (user) {
            const token = generateToken(user);
            res.json({ token, user });
        } else {
            res.status(404).json("No user found. Please Register");
        }
    } catch (error) {
        res.status(400).json("Error reading data from users table");
    }
});

app.post("/register", async (req, res) => {
    const { name, mobile } = req.body;

    if (!name || isNaN(mobile)) {
        return res.status(400).json("Please Enter Proper Details.");
    }

    try {
        const users = (await getTableData(TABLES_NAME.TABLE_USERS)).rows;
        const isMobileRegistered = users.some((user) => user.mobile === mobile);
        if (isMobileRegistered) {
            return res.status(409).json("Mobile Number is already registered.");
        } else {
            const newUser = {
                userimage: null,
                contacttype: CONTACT_TYPE.PERSON,
                name: name,
                mobile: mobile,
            };
            const newUserContacts = { mobile: mobile, contacts: [], memberof: [] };
            await insertData(TABLES_NAME.TABLE_USERS, [newUser]);
            await insertData(TABLES_NAME.TABLE_USERSCONTACT, [newUserContacts]);
            res.status(200).json("Registered Successfully.");
        }
    } catch (error) {
        res.status(400).json("Error registering Number.", error);
    }
});

app.post(
    "/addcontact/:usermobile",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const { usermobile } = req.params;
        const { mobile } = req.body;

        if (isNaN(mobile)) {
            return res.json({ error: "Please Enter a Proper Number" });
        }

        try {
            const users = (await getTableData(TABLES_NAME.TABLE_USERS)).rows;
            const registeredUser = users.find((user) => user.mobile === mobile);

            if (!registeredUser) {
                return res.json({ error: "Number is not registered." });
            }

            if (registeredUser.mobile === usermobile) {
                return res.json({ error: "You cannot add your own number." });
            }

            const usersContact = (await getTableData(TABLES_NAME.TABLE_USERSCONTACT))
                .rows;
            const userContact = usersContact.find(
                (contact) => contact.mobile === usermobile
            );

            const contactExists = userContact?.contacts.some(
                (contact) => contact.mobile === mobile
            );

            if (contactExists) {
                return res.json({ error: "Number already in your contacts." });
            }

            const addUsersContact = usersContact.find(
                (contact) => contact.mobile === mobile
            );

            const currentUserData = users.find((user) => user.mobile === usermobile);
            const condition1 = `mobile = '${currentUserData.mobile}'`;
            await updateData(
                TABLES_NAME.TABLE_USERSCONTACT,
                [{ contacts: [...(userContact.contacts || []), registeredUser] }],
                condition1
            );

            const condition2 = `mobile = '${registeredUser.mobile}'`;
            await updateData(
                TABLES_NAME.TABLE_USERSCONTACT,
                [{ contacts: [...(addUsersContact.contacts || []), currentUserData] }],
                condition2
            );

            [registeredUser.mobile, currentUserData.mobile].forEach((mobile) => {
                const recipient = findWebSocketConnectionByClientId(mobile);
                if (recipient) {
                    broadcastmessagetoClient(
                        recipient,
                        JSON.stringify({ message: MESSAGE_TYPE.UPDATECONTACT })
                    );
                }
            });

            res.json({ message: "New contact added successfully" });
        } catch (error) {
            console.error("Error updating users contact", error);
            res.status(400).json("Error updating users contact");
        }
    }
);

app.delete(
    "/deletecontact/:usermobile",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const { usermobile } = req.params;
        const { mobile } = req.body;

        try {
            const usersContact = (await getTableData(TABLES_NAME.TABLE_USERSCONTACT))
                .rows;

            const userContact = usersContact.find(
                (contact) => contact.mobile === usermobile
            );
            const deleteUserContacts = usersContact.find(
                (contact) => contact.mobile === mobile
            );

            if (!userContact || !deleteUserContacts) {
                return res.status(404).json("User or contact not found.");
            }

            userContact.contacts = userContact.contacts.filter(
                (contact) => contact.mobile !== mobile
            );
            deleteUserContacts.contacts = deleteUserContacts.contacts.filter(
                (contact) => contact.mobile !== usermobile
            );

            const conditions = [
                { mobile: userContact.mobile, contacts: userContact.contacts },
                {
                    mobile: deleteUserContacts.mobile,
                    contacts: deleteUserContacts.contacts,
                },
            ];

            await Promise.all(
                conditions.map(async (condition) => {
                    const { mobile, contacts } = condition;
                    const recipient = findWebSocketConnectionByClientId(mobile);
                    if (recipient) {
                        broadcastmessagetoClient(
                            recipient,
                            JSON.stringify({ message: MESSAGE_TYPE.UPDATECONTACT })
                        );
                    }
                    await updateData(
                        TABLES_NAME.TABLE_USERSCONTACT,
                        [{ contacts: contacts }],
                        `mobile = '${mobile}'`
                    );
                })
            );

            return res.status(200).json("Contact deleted successfully");
        } catch (error) {
            console.error("Error deleting contact:", error);
            res.status(400).json("Error deleting contact");
        }
    }
);

app.get(
    "/usercontact/:mobile",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const { mobile } = req.params;

        try {
            const usersContact = (await getTableData(TABLES_NAME.TABLE_USERSCONTACT))
                .rows;
            const userContact =
                usersContact.find((contact) => contact.mobile === mobile) || null;

            let updatedUserContact = [];

            if (userContact && Array.isArray(userContact.contacts)) {
                const users = (await getTableData(TABLES_NAME.TABLE_USERS)).rows;

                updatedUserContact = userContact.contacts.map((contact) => {
                    const userInContact = users.find(
                        (user) => user.mobile === contact.mobile
                    );
                    return userInContact;
                });
            }

            const usersGroup = (await getTableData(TABLES_NAME.TABLE_USERSGROUP))
                .rows;

            const userGroup = usersGroup.filter((group) => group.mobile === mobile);

            let updatedUserGroup = [];

            if (userContact && Array.isArray(userContact.memberof)) {
                updatedUserGroup = usersGroup.filter((group) =>
                    userContact.memberof.some((memberOf) => memberOf === group.uniqueid)
                );
            }

            res.json({
                userContact: {
                    ...userContact,
                    contacts: [...updatedUserContact],
                    memberof: updatedUserGroup,
                },
                userGroup: [...userGroup],
            });
        } catch (error) {
            console.error("Error retrieving data:", error);
            res.status(500).json({ error: "Internal Server Error" });
        }
    }
);

app.put(
    "/edituser/:usermobile",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const { usermobile } = req.params;
        const {
            editname = "",
            updatename = false,
            userimage = null,
            updateimage = false,
            fileinfo = null,
        } = req.body;

        try {
            const users = (await getTableData(TABLES_NAME.TABLE_USERS)).rows;
            const currentUser = users.find((user) => user.mobile === usermobile);

            if (!currentUser) {
                return res.status(400).json("User not found");
            }

            let updatedUser = null;

            if (updateimage && fileinfo) {
                const binaryData = Buffer.from(userimage, "base64");

                updatedUser = { userimage: binaryData, fileinfo: fileinfo };
            }

            if (updatename && editname) {
                updatedUser = { name: editname };
            }

            await updateData(
                TABLES_NAME.TABLE_USERS,
                [updatedUser],
                `mobile = '${currentUser.mobile}'`
            );

            const usersContact = (await getTableData(TABLES_NAME.TABLE_USERSCONTACT))
                .rows;
            const userContact = usersContact.find(
                (contact) => contact.mobile === currentUser.mobile
            );

            userContact.contacts.forEach(async (member) => {
                const recipient = findWebSocketConnectionByClientId(member.mobile);
                if (recipient) {
                    broadcastmessagetoClient(
                        recipient,
                        JSON.stringify({ message: MESSAGE_TYPE.UPDATECONTACT })
                    );
                }
            });

            res.status(200).json({ ...currentUser, ...updatedUser });
        } catch (error) {
            console.error("Error editing user:", error);
            res.status(400).json("Error editing user");
        }
    }
);

app.post(
    "/creategroup/:usermobile",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const { usermobile } = req.params;
        const { groupname, members } = req.body;

        try {
            const users = (await getTableData("users")).rows;
            const groupadmin = users.find((user) => user.mobile === usermobile);

            const uniqueid = generateUniqueId();

            const newGroup = {
                uniqueid: uniqueid,
                contacttype: CONTACT_TYPE.GROUP,
                mobile: usermobile,
                name: groupname,
                adminname: groupadmin.name,
                members: [groupadmin, ...members],
            };

            await insertData(TABLES_NAME.TABLE_USERSGROUP, [newGroup]);

            const usersContact = (await getTableData(TABLES_NAME.TABLE_USERSCONTACT))
                .rows;

            for (const member of members) {
                const userContactIndex = usersContact.findIndex(
                    (contact) => contact.mobile === member.mobile
                );

                if (userContactIndex !== -1) {
                    const existingMemberOf =
                        usersContact[userContactIndex].memberof || [];

                    const updatedContact = {
                        memberof: [...existingMemberOf, uniqueid],
                    };

                    const condition = `mobile = '${member.mobile}'`;
                    await updateData(
                        TABLES_NAME.TABLE_USERSCONTACT,
                        [updatedContact],
                        condition
                    );
                }

                const recipient = findWebSocketConnectionByClientId(member.mobile);
                if (recipient) {
                    broadcastmessagetoClient(
                        recipient,
                        JSON.stringify({ message: MESSAGE_TYPE.UPDATECONTACT })
                    );
                }
            }

            res.status(201).json(newGroup);
        } catch (error) {
            console.error("Error Creating Chat Group", error);
            res.status(400).json("Error Creating Chat Group");
        }
    }
);

app.post(
    "/updategroup",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const { member, uniqueid } = req.body;
        let addingmember = false;

        try {
            const usersGroup = (await getTableData(TABLES_NAME.TABLE_USERSGROUP))
                .rows;
            const userContact = (
                await getTableData(TABLES_NAME.TABLE_USERSCONTACT)
            ).rows.find((user) => user.mobile === member.mobile);

            const groupToUpdate = usersGroup.find(
                (group) => group.uniqueid === uniqueid
            );

            if (!groupToUpdate) {
                return res.status(404).json({ error: "Group not found" });
            }

            const memberIndex = groupToUpdate.members.findIndex(
                (temp) => temp.mobile === member.mobile
            );

            if (memberIndex >= 0) {
                groupToUpdate.members.splice(memberIndex, 1);
            } else {
                groupToUpdate.members.push(member);
                addingmember = true;
            }

            const condition1 = `uniqueid = '${uniqueid}'`;
            await updateData(
                TABLES_NAME.TABLE_USERSGROUP,
                [{ members: groupToUpdate.members }],
                condition1
            );

            const groupIndex = userContact.memberof.findIndex(
                (groupid) => groupid === uniqueid
            );

            if (groupIndex >= 0 && !addingmember) {
                userContact.memberof.splice(groupIndex, 1);
            } else {
                userContact.memberof.push(uniqueid);
            }

            const condition2 = `mobile = '${member.mobile}'`;
            await updateData(
                TABLES_NAME.TABLE_USERSCONTACT,
                [{ memberof: userContact.memberof }],
                condition2
            );

            const updatedMembers = [...groupToUpdate.members, member];

            for (const groupMember of updatedMembers) {
                const recipient = findWebSocketConnectionByClientId(groupMember.mobile);
                if (recipient) {
                    broadcastmessagetoClient(
                        recipient,
                        JSON.stringify({ message: MESSAGE_TYPE.UPDATECONTACT })
                    );
                }
            }

            res.status(200).json({ message: "Group updated successfully." });
        } catch (error) {
            console.error("Error updating group:", error);
            res.status(500).json({ error: "Error updating group" });
        }
    }
);

app.delete(
    "/leavegroup/:usermobile",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const { usermobile } = req.params;
        const { uniqueid } = req.body;

        try {
            const usersGroup = (await getTableData(TABLES_NAME.TABLE_USERSGROUP))
                .rows;
            const chatGroup = usersGroup.find((group) => group.uniqueid === uniqueid);

            if (!chatGroup) {
                return res.status(404).send("Group not found");
            }

            const memberIndex = chatGroup.members.findIndex(
                (member) => member.mobile === usermobile
            );

            if (memberIndex === -1) {
                return res.status(404).send("User not found");
            }

            const usersContact = (await getTableData(TABLES_NAME.TABLE_USERSCONTACT))
                .rows;
            const userGroupContact = usersContact.find(
                (user) => user.mobile === usermobile
            );

            if (!userGroupContact) {
                return res.status(404).send("User is not part of any groups");
            }

            const groupIndex = userGroupContact.memberof.findIndex(
                (groupid) => groupid === uniqueid
            );

            if (groupIndex >= 0) {
                userGroupContact.memberof.splice(groupIndex, 1);
                await updateData(
                    TABLES_NAME.TABLE_USERSCONTACT,
                    [userGroupContact],
                    `mobile = '${userGroupContact.mobile}'`
                );

                chatGroup.members.splice(memberIndex, 1);
                await updateData(
                    TABLES_NAME.TABLE_USERSGROUP,
                    [chatGroup],
                    `uniqueid = '${chatGroup.uniqueid}'`
                );

                [...chatGroup.members, { mobile: usermobile }].forEach((member) => {
                    const recipient = findWebSocketConnectionByClientId(member.mobile);
                    if (recipient) {
                        broadcastmessagetoClient(
                            recipient,
                            JSON.stringify({ message: MESSAGE_TYPE.UPDATECONTACT })
                        );
                    }
                });

                return res.status(200).send("User removed from group.");
            } else {
                return res.status(404).send("User is not part of the specified group");
            }
        } catch (error) {
            console.error("Error leaving group:", error);
            res.status(400).send("Error leaving group");
        }
    }
);

app.delete(
    "/deletegroup/:usermobile",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const { usermobile } = req.params;
        const { uniqueid } = req.body;

        try {
            const usersGroup = (await getTableData(TABLES_NAME.TABLE_USERSGROUP))
                .rows;

            const groupToDelete = usersGroup.find(
                (group) => group.uniqueid === uniqueid
            );

            if (!groupToDelete) {
                return res.status(404).json({ error: "No group found." });
            }

            if (groupToDelete.mobile !== usermobile) {
                return res
                    .status(401)
                    .json({ error: "Only an Admin can delete this group." });
            }

            const usersContact = (await getTableData(TABLES_NAME.TABLE_USERSCONTACT))
                .rows;

            for (const member of groupToDelete.members) {
                const memberContact = usersContact.find(
                    (_contact) => _contact.mobile === member.mobile
                );
                const groupIndex = memberContact.memberof.findIndex(
                    (groupid) => groupid === uniqueid
                );

                if (groupIndex >= 0) {
                    memberContact.memberof.splice(groupIndex, 1);

                    const condition2 = `mobile = '${memberContact.mobile}'`;
                    await updateData(
                        TABLES_NAME.TABLE_USERSCONTACT,
                        [{ memberof: memberContact.memberof }],
                        condition2
                    );

                    const recipient = findWebSocketConnectionByClientId(
                        memberContact.mobile
                    );
                    if (recipient) {
                        broadcastmessagetoClient(
                            recipient,
                            JSON.stringify({ message: MESSAGE_TYPE.UPDATECONTACT })
                        );
                    }
                }
            }

            const userRecipient = findWebSocketConnectionByClientId(usermobile);
            if (userRecipient) {
                broadcastmessagetoClient(
                    userRecipient,
                    JSON.stringify({ message: MESSAGE_TYPE.UPDATECONTACT })
                );
            }

            await deleteGroup(TABLES_NAME.TABLE_USERSGROUP, groupToDelete.id);

            res.status(200).json({ message: "Group deleted successfully." });
        } catch (error) {
            console.error("Error handling group deletion:", error);
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

app.put(
    "/editgroup/:usermobile",
    passport.authenticate("jwt", { session: false }),
    async (req, res) => {
        const { usermobile } = req.params;
        const { uniqueid, editname, editimage = null, fileinfo = null } = req.body;

        try {
            const usersGroup = (await getTableData(TABLES_NAME.TABLE_USERSGROUP))
                .rows;

            const groupToEdit = usersGroup.find(
                (group) => group.uniqueid === uniqueid
            );

            if (!groupToEdit) {
                return res.status(404).json({ error: "No group found." });
            }

            if (groupToEdit.mobile !== usermobile) {
                return res
                    .status(401)
                    .json({ error: "Only an Admin can Edit this group." });
            }

            const condition1 = `id = '${groupToEdit.id}'`;

            if (editname) {
                await updateData(
                    TABLES_NAME.TABLE_USERSGROUP,
                    [{ name: editname }],
                    condition1
                );
            }

            let binaryData;

            if (editimage && fileinfo) {
                binaryData = Buffer.from(editimage, "base64");
                await updateData(
                    TABLES_NAME.TABLE_USERSGROUP,
                    [{ groupimage: binaryData, fileinfo: fileinfo }],
                    condition1
                );
            }

            const usersContact = (await getTableData(TABLES_NAME.TABLE_USERSCONTACT))
                .rows;

            for (const member of groupToEdit.members) {
                const memberContact = usersContact.find(
                    (_contact) => _contact.mobile === member.mobile
                );
                const groupIndex = memberContact.memberof.findIndex(
                    (groupid) => groupid === uniqueid
                );

                if (groupIndex >= 0) {
                    const recipient = findWebSocketConnectionByClientId(
                        memberContact.mobile
                    );
                    if (recipient) {
                        broadcastmessagetoClient(
                            recipient,
                            JSON.stringify({ message: MESSAGE_TYPE.UPDATECONTACT })
                        );
                    }
                } else {
                }
            }

            const userRecipient = findWebSocketConnectionByClientId(usermobile);
            if (userRecipient) {
                broadcastmessagetoClient(
                    userRecipient,
                    JSON.stringify({ message: MESSAGE_TYPE.UPDATECONTACT })
                );
            }

            res.status(200).json({ message: "Group Edited successfully." });
        } catch (error) {
            console.error("Error handling group edit:", error);
            res.status(500).json({ error: "Internal server error." });
        }
    }
);

app.delete("/resetdatabase", async (req, res) => {
    try {
        await resetDatabase();
        res.status(200).json({ message: "Database reset successfully." });
    } catch (error) {
        console.error("Error resetting database:", error);
        res.status(500).json({ error: "Internal server error." });
    }
});

function generateUniqueId() {
    const randomPart = Math.random().toString(36).substr(2, 9);
    const timestampPart = new Date().getTime().toString(36);
    const uniqueId = randomPart + timestampPart;
    return uniqueId;
}

testDatabaseConnection().then(() => {
    initializeDatabase().then(() => {
        const PORT = process.env.PORT || 8080;
        server.listen(PORT, () => {
            console.log(`Server is running on port ${PORT}`);
        });
    });
});
