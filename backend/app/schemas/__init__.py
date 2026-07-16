from marshmallow import Schema, fields, validate, ValidationError, EXCLUDE


class RegisterSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(required=True, validate=validate.Length(min=1, max=120))
    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=8, max=128))


class LoginSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    email = fields.Email(required=True)
    password = fields.Str(required=True, validate=validate.Length(min=1, max=128))


register_schema = RegisterSchema()
login_schema = LoginSchema()


def validate_json(schema, data):
    """Validate request JSON; returns (cleaned_data, error_response_tuple_or_None)."""
    if not data:
        return None, (
            {"success": False, "message": "No input data provided"},
            400,
        )
    try:
        return schema.load(data), None
    except ValidationError as err:
        return None, (
            {
                "success": False,
                "message": "Validation failed",
                "errors": err.messages,
            },
            400,
        )
