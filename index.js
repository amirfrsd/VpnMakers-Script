var express = require('express');
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var zarinpalCheckout = require('zarinpal-checkout');
var request = require('request-promise');
var morgan = require('morgan');


var version = 1;
var prices = ['3500', '9000', '15000', '25000']
var app = express();
var port = process.env.port || 9282;
var router = express.Router();
var zarinpal = zarinpalCheckout.create('MERCHANT-ID||MERCHANT-ID|MERCHANT-ID', true);
var headers = {
    'X-Auth-Name': 'X-AUTH-NAME',
    'X-Auth-Key': 'X-AUTH-KEY',
    'Content-Type': 'application/json'
};


app.use(morgan('dev'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/', router);

mongoose.connect('mongodb://localhost/vpnmakers');


var userSchema = new mongoose.Schema({
    username: String,
    password: String,
    credit: Number
})
var User = mongoose.model('User', userSchema);


var invoiceSchema = new mongoose.Schema({
    username: String,
    mail: String,
    authority: String,
    amount: Number,
    done: Boolean,
    renewal: Boolean,
    claimed: Boolean
})
var Invoice = mongoose.model('Invoice', invoiceSchema);



var newPayment = function (amount, email, username, renewal) {
    return promise = new Promise(function (resolve, reject) {
        zarinpal.PaymentRequest({
            Amount: amount,
            CallbackURL: 'http://192.168.1.38:9282/invoices/validate',
            Description: 'پرداخت درون برنامه ای',
            Email: email,
            Mobile: '09120000000'
        }).then(response => {
            if (response.status === 100) {
                var invoice = new Invoice({ username: username, mail: email, authority: response.authority, amount: amount, done: false, renewal: renewal, claimed: false });
                invoice.save(function (err) {
                    if (!err) {
                        resolve(response.url);
                    } else {
                        reject(response.url);
                    }
                });
            }
        }).catch(err => {
            reject(err);
        });
    });
}

var isPaymentDone = function (zarinpalAuth, amount, renewal) {
    return promise = new Promise(function (resolve, reject) {
        Invoice.findOne({ authority: zarinpalAuth, amount: amount }, function (err, object) {
            if (!err && object) {
                if (object.done && !object.claimed && object.renewal === renewal) {
                    resolve(true);
                } else {
                    reject(false);
                }
            } else {
                reject(false);
            }
        });
    });
}

var getUserInfo = function (username) {
    var options = {
        url: 'https://api.vpnm.me/resellers/v2/user/' + username,
        headers: headers
    };
    var promise = new Promise(function (resolve, reject) {
        request(options).then(function (body) { resolve(body) }).catch(function (err) { reject(err) });
    });
    return promise;
}

var createAccountCore = function (username, pass, credit) {
    var dataString = '{"credit":' + credit + ',"password":"' + pass + '"}';
    var url = 'https://api.vpnm.me/resellers/v2/user/' + username;
    var options = {
        url: url,
        method: 'POST',
        headers: headers,
        body: dataString
    };
    var promise = new Promise(function (resolve, reject) {
        request(options).then(function (body) {
            Invoice.findOneAndUpdate({ username: username }, { claimed: true }, function (err) {
                if (!err) {
                    var user = new User({ username: username, password: pass, credit: credit });
                    user.save(function (err) {
                        if (!err) {
                            resolve(true);
                        } else {
                            reject(false);
                        }
                    });
                }
            });
        }).catch(function (err) {
            reject(false);
        });
    });
    return promise;
}

var renewVpnCore = function (username, credit) {
    var promise = new Promise(function (resolve, reject) {
        User.findOne({ username: username }, function (err, obj) {
            if (!err && obj) {
                let currentCredit = obj.credit;
                let creditToSet = currentCredit + credit;
                var dataString = '{"credit":' + creditToSet + '}';
                var url = 'https://api.vpnm.me/resellers/v2/user/' + username + '/credit';
                var options = {
                    url: url,
                    method: 'PUT',
                    headers: headers,
                    body: dataString
                };
                request(options).then(function (body) {
                    User.findOneAndUpdate({ username: username }, { credit: creditToSet }, function (err, object) {
                        if (!err && object) {
                            resolve(true);
                        } else {
                            reject(false);
                        }
                    });
                }).catch(function (err) {
                    reject(false)
                });

            } else {
                reject(false);
            }
        });
    });
    return promise;
}

var payedAmountToCredit = function (amount) {
    switch (amount) {
        case "3500":
            return 31;
        case "9000":
            return 61;
        case "15000":
            return 125;
        case "25000":
            return 365;
    }
}

var createAccount = function (authority, payedAmount, creditToAdd, username, password) {
    return promise = new Promise(function (resolve, reject) {
        isPaymentDone(authority, payedAmount, false).then(function (boolVal) {
            let credit = payedAmountToCredit(payedAmount);
            createAccountCore(username, password, credit).then(function (boolVal) {
                resolve(true);
            }).catch(function (boolVal) {
                reject(false);
            });
        }).catch(function (boolVal) {
            reject(false);
        });
    });
}

var renewVpn = function (username, credit, authority, payedAmount) {
    return promise = new Promise(function (resolve, reject) {
        isPaymentDone(authority, payedAmount, true).then(function (boolVal) {
            let creditVal = payedAmountToCredit(payedAmount);
            renewVpnCore(username, creditVal).then(function (boolVal) {
                resolve(true);
            }).catch(function (boolVal) {
                reject(false);
            });
        }).catch(function (boolVal) {
            reject(false);
        });
    });
}

var changePass = function (username, oldPass, password) {
    var dataString = '{"password":' + '"' + password + '"}';
    var url = 'https://api.vpnm.me/resellers/v2/user/' + username + '/password';
    var options = {
        url: url,
        method: 'PUT',
        headers: headers,
        body: dataString
    };
    return promise = new Promise(function (resolve, reject) {
        User.findOne({ username: username, password: oldPass }, function (err, object) {
            if (!err && object) {
                request(options).then(function (body) {
                    User.findOneAndUpdate({ username: username, password: oldPass }, { password: password }, function (err, object) {
                        if (!err) {
                            resolve(true);
                        } else {
                            reject(false);
                        }
                    });
                }).catch(function (err) {
                    reject(false)
                });
            } else {
                reject(false);
            }
        });
    });

}

var removeService = function (username, password) {
    var url = 'https://api.vpnm.me/resellers/v2/user/' + username;
    var options = {
        url: url,
        method: 'DELETE',
        headers: headers,
    };
    return promise = new Promise(function (resolve, reject) {
        User.findOneAndRemove({ username: username, password: password }, function (err, object) {
            if (!err && object) {
                request(options).then(function (body) {
                    resolve(true);
                }).catch(function (err) {
                    reject(false);
                });
            }
        });
    });
}

router.put('/users/:user/password', function (req, res) {
    let username = req.params.user;
    let password = req.body.password;
    changePass(username, req.body.oldpass, password).then(function (boolVal) {
        res.json({ success: true, message: 'کلمه عبور تغییر یافت.' });
    }).catch(function (boolVal) {
        res.json({ success: false, message: 'لطفا دوباره تلاش نمایید.' });
    });
});

router.delete('/users/:user', function (req, res) {
    let username = req.params.user;
    removeService(username, req.body.pass).then(function (boolVal) {
        res.json({ success: true, message: 'نام کاربری و سرویس شما حذف شد.' });
    }).catch(function (boolVal) {
        res.json({ success: false, message: 'متاسفانه نام کاربری یافت نشد.' });
    });
});

router.get('/users/:user', function (req, res) {
    let username = req.params.user;
    getUserInfo(username).then(function (response) {
        res.send(response)
    }).catch(function (err) {
        res.json({ success: false, message: 'متاسفانه نام کاربری یافت نشد.' })
    });
});

router.post('/users/new', function (req, res) {
    createAccount(req.body.authority, req.body.amount, req.body.credit, req.body.username, req.body.password).then(function (boolVal) {
        res.json({ success: true, message: 'سرویس شما ایجاد شد.' });
    }).catch(function (boolVal) {
        res.json({ success: false, message: 'با پشتیبانی تماس بگیرید.' });
    });
});

router.put('/users/:user/topup', function (req, res) {
    renewVpn(req.params.user, req.body.credit, req.body.authority, req.body.amount).then(function (body) {
        res.json({ success: true, message: 'سرویس شما تمدید شد.' });
    }).catch(function (err) {
        res.json({ success: false, message: 'با پشتیبانی تماس بگیرید.' });
    });
});

router.get('/startup', function (req, res) {
    res.json({ success: true, version: version, prices })
});

router.get('/invoices/validate', function (req, res) {
    Invoice.findOne({ authority: req.query.Authority }, function (err, object) {
        if (!err && object) {
            zarinpal.PaymentVerification({
                Amount: object.amount,
                Authority: req.query.Authority,
            }).then(response => {
                if (response.status === -21) {
                    res.redirect('veepee://failed');
                } else {
                    var id = object._id;
                    Invoice.findByIdAndUpdate(id, { done: true }, function (err, obj) {
                        if (err) {
                        } else if (!obj) {
                            res.redirect('veepee://failed');
                        } else {
                            res.redirect('veepee://' + obj.authority);
                        }
                    });
                }
            }).catch(err => {
                console.error(err);
            });
        } else {
            res.redirect('veepee://failed')
        }
    });
});

router.post('/invoices/new', function (req, res) {
    newPayment(req.body.amount, req.body.mail, req.body.username, req.body.renewal).then(function (response) {
        res.json({ success: true, message: response });
    }).catch(function (err) {
        res.json({ success: false, message: 'اشکال در آغاز پرداخت.' })
    });
});

router.get('/', function (req, res) { res.send('Hey Brotha :P') });

app.listen(port);
