const AWS = require('aws-sdk');
const axios = require('axios');
const { verifyJWT } = require('../captchaUtil');
const { dynamodb, runQuery, TABLE_NAME, DEFAULT_BOOKING_DAYS_AHEAD, TIMEZONE } = require('../dynamoUtil');
const { sendResponse, checkWarmup } = require('../responseUtil');
const { DateTime } = require('luxon');
const { logger } = require('../logger');

// default opening/closing hours in 24h time
const DEFAULT_AM_OPENING_HOUR = 7;
const DEFAULT_PM_OPENING_HOUR = 12;

exports.handler = async (event, context) => {
  let passObject = {
    TableName: TABLE_NAME,
    ConditionExpression: 'attribute_not_exists(sk)'
  };

  if (!event) {
    return sendResponse(
      400,
      {
        msg: 'There was an error in your submission.',
        title: 'Bad Request'
      },
      context
    );
  }

  if (checkWarmup(event)) {
    return sendResponse(200, {});
  }

  try {
    let newObject = JSON.parse(event.body);

    const registrationNumber = generate(10);

    let {
      parkName,
      firstName,
      lastName,
      facilityName,
      email,
      date,
      type,
      numberOfGuests,
      phoneNumber,
      facilityType,
      captchaJwt,
      ...otherProps
    } = newObject;

    if (!captchaJwt || !captchaJwt.length) {
      return sendResponse(400, {
        msg: 'Missing CAPTCHA verification.',
        title: 'Missing CAPTCHA verification'
      });
    }

    const verification = verifyJWT(captchaJwt);
    if (!verification.valid) {
      return sendResponse(400, {
        msg: 'CAPTCHA verification failed.',
        title: 'CAPTCHA verification failed'
      });
    }

    // Enforce maximum limit per pass
    if (facilityType === 'Trail' && numberOfGuests > 4) {
      return sendResponse(400, {
        msg: 'You cannot have more than 4 guests on a trail.',
        title: 'Too many guests'
      });
    }

    if (facilityType === 'Parking') {
      numberOfGuests = 1;
    }

    // Get current time vs booking time information
    // Log server DateTime
    logger.debug('Server Time Zone:',
      Intl.DateTimeFormat().resolvedOptions().timeZone || 'undefined',
      `(${DateTime.now().toISO()})`
    );
    const currentPSTDateTime = DateTime.now().setZone(TIMEZONE);
    const bookingPSTDateTime = DateTime.fromISO(date)
      .setZone(TIMEZONE)
      .set(
        {
          hour: 12,
          minutes: 0,
          seconds: 0,
          milliseconds: 0
        }
      );

    let facilityObj = {
      TableName: TABLE_NAME
    };

    // check if booking date in the past
    const currentPSTDateStart = currentPSTDateTime.startOf('day');
    if (currentPSTDateStart.toISO() > bookingPSTDateTime.toISO()) {
      return sendResponse(400, {
        msg: 'You cannot book for a date in the past.',
        title: 'Booking date in the past'
      });
    }

    facilityObj.ExpressionAttributeValues = {};
    facilityObj.ExpressionAttributeValues[':pk'] = { S: 'facility::' + parkName };
    facilityObj.ExpressionAttributeValues[':sk'] = { S: facilityName };
    facilityObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
    const facilityData = await runQuery(facilityObj);

    // Check bookingDaysAhead
    const bookingDaysAhead = facilityData[0].bookingDaysAhead === null ? DEFAULT_BOOKING_DAYS_AHEAD : facilityData[0].bookingDaysAhead;
    const futurePSTDateTimeMax = currentPSTDateTime.plus({ days: bookingDaysAhead });
    if (bookingPSTDateTime.startOf('day') > futurePSTDateTimeMax.startOf('day')) {
      return sendResponse(400, {
        msg: 'You cannot book for a date that far ahead.',
        title: 'Booking date in the future invalid'
      });
    }

    // There should only be 1 facility.
    let openingHour = facilityData[0].bookingOpeningHour || DEFAULT_AM_OPENING_HOUR;
    let closingHour = DEFAULT_PM_OPENING_HOUR;

    let status = 'reserved';

    // check if booking same-day
    if (currentPSTDateTime.get('day') === bookingPSTDateTime.get('day')) {
      // check if AM/PM/DAY is currently open
      const currentPSTHour = currentPSTDateTime.get('hour');
      if (type === 'AM' && currentPSTHour >= DEFAULT_PM_OPENING_HOUR) {
        // it is beyond AM closing time
        return sendResponse(400, {
          msg:
            'It is too late to book an AM pass on this day (AM time slot is from ' +
            to12hTimeString(openingHour) +
            ' to ' +
            to12hTimeString(closingHour) +
            ').',
          title: 'AM time slot has expired'
        });
      }
      if (type === 'PM') {
        openingHour = DEFAULT_PM_OPENING_HOUR;
      }
      if (currentPSTHour >= openingHour) {
        status = 'active';
      }
    }

    const bookingPSTShortDate = bookingPSTDateTime.toISODate();

    passObject.Item = {};
    passObject.Item['pk'] = { S: 'pass::' + parkName };
    passObject.Item['sk'] = { S: registrationNumber };
    passObject.Item['firstName'] = { S: firstName };
    passObject.Item['searchFirstName'] = { S: firstName.toLowerCase() };
    passObject.Item['lastName'] = { S: lastName };
    passObject.Item['searchLastName'] = { S: lastName.toLowerCase() };
    passObject.Item['facilityName'] = { S: facilityName };
    passObject.Item['email'] = { S: email };
    passObject.Item['date'] = { S: bookingPSTDateTime.toUTC().toISO() };
    passObject.Item['shortPassDate'] = { S: bookingPSTShortDate };
    passObject.Item['type'] = { S: type };
    passObject.Item['registrationNumber'] = { S: registrationNumber };
    passObject.Item['numberOfGuests'] = AWS.DynamoDB.Converter.input(numberOfGuests);
    passObject.Item['passStatus'] = { S: status };
    passObject.Item['phoneNumber'] = AWS.DynamoDB.Converter.input(phoneNumber);
    passObject.Item['facilityType'] = { S: facilityType };
    passObject.Item['creationDate'] = {S: currentPSTDateTime.toUTC().toISO() };

    const cancellationLink =
      process.env.PUBLIC_FRONTEND +
      process.env.PASS_CANCELLATION_ROUTE +
      '?passId=' +
      registrationNumber +
      '&email=' +
      email +
      '&park=' +
      parkName + 
      '&date=' +
      bookingPSTShortDate +
      '&type=' +
      type;

    const encodedCancellationLink = encodeURI(cancellationLink);

    let gcNotifyTemplate = process.env.GC_NOTIFY_TRAIL_RECEIPT_TEMPLATE_ID;

    const dateOptions = { day: 'numeric', month: 'long', year: 'numeric' };
    const formattedBookingDate = bookingPSTDateTime.toLocaleString(dateOptions);

    // Only let pass come through if there's enough room
    let parkObj = {
      TableName: TABLE_NAME
    };

    parkObj.ExpressionAttributeValues = {};
    parkObj.ExpressionAttributeValues[':pk'] = { S: 'park' };
    parkObj.ExpressionAttributeValues[':sk'] = { S: parkName };
    parkObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';
    const parkData = await runQuery(parkObj);
    logger.debug('ParkData:', parkData);

    let personalisation = {
      firstName: firstName,
      lastName: lastName,
      date: formattedBookingDate,
      type: type === 'DAY' ? 'ALL DAY' : type,
      facilityName: facilityName,
      numberOfGuests: numberOfGuests.toString(),
      registrationNumber: registrationNumber.toString(),
      cancellationLink: encodedCancellationLink,
      parkName: parkName,
      mapLink: parkData[0].mapLink,
      parksLink: parkData[0].bcParksLink
    };

    // Parking.
    if (facilityType === 'Parking') {
      gcNotifyTemplate = process.env.GC_NOTIFY_PARKING_RECEIPT_TEMPLATE_ID;
    }

    if (parkData[0].visible === true) {
      // Check existing pass for the same facility, email, type and date
      try {
        const existingPassCheckObject = {
          TableName: TABLE_NAME,
          KeyConditionExpression: 'pk = :pk',
          FilterExpression:
            'facilityName = :facilityName AND email = :email AND #type = :type AND begins_with(#date, :date) AND (passStatus = :reserved OR passStatus = :active)',
          ExpressionAttributeNames: {
            '#type': 'type',
            '#date': 'date'
          },
          ExpressionAttributeValues: {
            ':pk': { S: 'pass::' + parkName },
            ':facilityName': { S: facilityName },
            ':email': { S: email },
            ':type': { S: type },
            ':date': { S: bookingPSTShortDate },
            ':reserved': { S: 'reserved' },
            ':active': { S: 'active' }
          }
        };

        const existingItems = await dynamodb.query(existingPassCheckObject).promise();

        if (existingItems.Count > 0) {
          return sendResponse(400, {
            title: 'This email account already has a reservation for this booking time.',
            msg: 'A reservation associated with this email for this booking time already exists. Please check to see if you already have a reservation for this time. If you do not have an email confirmation of your reservation please contact <a href="mailto:parkinfo@gov.bc.ca">parkinfo@gov.bc.ca</a>'
          });
        }
      } catch (err) {
        logger.error(err);
        return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
      }

      try {
        // Make sure the key for the reservation exists
        let updateReservationObject = {
          Key: {
            pk: { S: 'facility::' + parkName },
            sk: { S: facilityName }
          },
          ExpressionAttributeValues: {
            ':dateSelectorInitialValue': { M: {} }
          },
          ExpressionAttributeNames: {
            '#dateselector': bookingPSTShortDate
          },
          UpdateExpression: 'SET reservations.#dateselector = :dateSelectorInitialValue',
          ConditionExpression: 'attribute_not_exists(reservations.#dateselector)',
          ReturnValues: 'ALL_NEW',
          TableName: TABLE_NAME
        };
        logger.debug('updateReservationObject:', updateReservationObject);
        const updateReservationObjectRes = await dynamodb.updateItem(updateReservationObject).promise();
        logger.debug('updateReservationObjectRes:', updateReservationObjectRes);
      } catch (e) {
        // Already there.
        logger.debug('dateSelectorInitialValue exists', e);
      }

      try {
        // Add the type into the map
        let addingProperty = {
          Key: {
            pk: { S: 'facility::' + parkName },
            sk: { S: facilityName }
          },
          ExpressionAttributeValues: {
            ':dateSelectorInitialValue': { N: '0' }
          },
          ExpressionAttributeNames: {
            '#dateselector': bookingPSTShortDate,
            '#type': type
          },
          UpdateExpression: 'SET reservations.#dateselector.#type = :dateSelectorInitialValue',
          ConditionExpression: 'attribute_not_exists(reservations.#dateselector.#type)',
          ReturnValues: 'ALL_NEW',
          TableName: TABLE_NAME
        };
        logger.debug('addingProperty:', addingProperty);
        const addingPropertyRes = await dynamodb.updateItem(addingProperty).promise();
        logger.debug('addingPropertyRes:', AWS.DynamoDB.Converter.unmarshall(addingPropertyRes));
      } catch (e) {
        // Already there.
        logger.debug('Type Prop exists', e);
      }

      try {
        let updateFacility = {
          Key: {
            pk: { S: 'facility::' + parkName },
            sk: { S: facilityName }
          },
          ExpressionAttributeValues: {
            ':inc': AWS.DynamoDB.Converter.input(numberOfGuests),
            ':start': AWS.DynamoDB.Converter.input(0)
          },
          ExpressionAttributeNames: {
            '#booking': 'bookingTimes',
            '#type': type,
            '#dateselector': bookingPSTShortDate,
            '#maximum': 'max'
          },
          UpdateExpression:
            'SET reservations.#dateselector.#type = if_not_exists(reservations.#dateselector.#type, :start) + :inc',
          ConditionExpression: '#booking.#type.#maximum > reservations.#dateselector.#type',
          ReturnValues: 'ALL_NEW',
          TableName: TABLE_NAME
        };
        logger.debug('updateFacility:', updateFacility);
        const facilityRes = await dynamodb.updateItem(updateFacility).promise();
        logger.debug('FacRes:', facilityRes);
      } catch (err) {
        // There are no more passes available.
        logger.error(err);
        return sendResponse(400, {
          msg: 'We have sold out of allotted passes for this time, please check back on the site from time to time as new passes may come available.',
          title: 'Sorry, we are unable to fill your specific request.'
        });
      }

      logger.debug('putting item:', passObject);
      const res = await dynamodb.putItem(passObject).promise();
      logger.debug('res:', res);

      try {
        await axios({
          method: 'post',
          url: process.env.GC_NOTIFY_API_PATH,
          headers: {
            Authorization: process.env.GC_NOTIFY_API_KEY,
            'Content-Type': 'application/json'
          },
          data: {
            email_address: email,
            template_id: gcNotifyTemplate,
            personalisation: personalisation
          }
        });
        logger.debug('GCNotify email sent.');
        return sendResponse(200, AWS.DynamoDB.Converter.unmarshall(passObject.Item));
      } catch (err) {
        logger.error('GCNotify error:', err);
        let errRes = AWS.DynamoDB.Converter.unmarshall(passObject.Item);
        errRes['err'] = 'Email Failed to Send';
        return sendResponse(200, errRes);
      }
    } else {
      // Not allowed for whatever reason.
      return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
    }
  } catch (err) {
    logger.error('err', err);
    return sendResponse(400, { msg: 'Something went wrong.', title: 'Operation Failed' });
  }
};

function to12hTimeString(hour) {
  let period = 'am';
  if (hour > 11) {
    period = 'pm';
    if (hour > 12) {
      hour -= 12;
    }
  }
  let hourStr = hour === 0 ? '12' : hour.toString();
  return hourStr + period;
}

function generate(count) {
  // TODO: Make this better
  return Math.random().toString().substr(count);
}
