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


class CartItemSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    product_id = fields.Int(required=True, validate=validate.Range(min=1))
    quantity = fields.Int(required=True, validate=validate.Range(min=1, max=999))


class CartItemUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    quantity = fields.Int(required=True, validate=validate.Range(min=1, max=999))


class SubmitOrderSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    fulfillment_type = fields.Str(
        load_default="pickup",
        validate=validate.OneOf(["reserve", "pickup"]),
    )
    title = fields.Str(load_default=None, validate=validate.Length(max=200))
    notes = fields.Str(load_default=None, validate=validate.Length(max=2000))
    contact_email = fields.Email(required=True)
    contact_phone = fields.Str(
        required=True,
        validate=validate.Length(min=7, max=40),
    )


class MessageCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    body = fields.Str(required=True, validate=validate.Length(min=1, max=5000))


DEPARTMENTS = ("textbooks", "stationery", "gifts")


class InventoryCreateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(required=True, validate=validate.Length(min=1, max=200))
    price = fields.Decimal(required=True, as_string=False, places=2)
    quantity = fields.Int(required=True, validate=validate.Range(min=0, max=1000000))
    department = fields.Str(required=True, validate=validate.OneOf(DEPARTMENTS))
    description = fields.Str(load_default=None, validate=validate.Length(max=5000))
    author = fields.Str(load_default=None, validate=validate.Length(max=200))
    publisher = fields.Str(load_default=None, validate=validate.Length(max=200))
    isbn = fields.Str(load_default=None, validate=validate.Length(max=32))
    school = fields.Str(load_default=None, validate=validate.Length(max=200))
    grades = fields.List(
        fields.Str(validate=validate.Length(min=1, max=80)),
        load_default=list,
        validate=validate.Length(max=20),
    )
    image_url = fields.Str(load_default=None, validate=validate.Length(max=500))
    is_active = fields.Bool(load_default=True)
    category_id = fields.Int(load_default=None, validate=validate.Range(min=1))


class InventoryUpdateSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    name = fields.Str(validate=validate.Length(min=1, max=200))
    price = fields.Decimal(as_string=False, places=2)
    quantity = fields.Int(validate=validate.Range(min=0, max=1000000))
    department = fields.Str(validate=validate.OneOf(DEPARTMENTS))
    description = fields.Str(allow_none=True, validate=validate.Length(max=5000))
    author = fields.Str(allow_none=True, validate=validate.Length(max=200))
    publisher = fields.Str(allow_none=True, validate=validate.Length(max=200))
    isbn = fields.Str(allow_none=True, validate=validate.Length(max=32))
    school = fields.Str(allow_none=True, validate=validate.Length(max=200))
    grades = fields.List(
        fields.Str(validate=validate.Length(min=1, max=80)),
        validate=validate.Length(max=20),
    )
    image_url = fields.Str(allow_none=True, validate=validate.Length(max=500))
    is_active = fields.Bool()
    category_id = fields.Int(allow_none=True, validate=validate.Range(min=1))


class ProductRatingSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    stars = fields.Int(required=True, validate=validate.Range(min=1, max=5))
    comment = fields.Str(
        allow_none=True,
        load_default=None,
        validate=validate.Length(max=2000),
    )


class NewsletterSubscribeSchema(Schema):
    class Meta:
        unknown = EXCLUDE

    email = fields.Email(required=True)


register_schema = RegisterSchema()
login_schema = LoginSchema()
cart_item_schema = CartItemSchema()
cart_item_update_schema = CartItemUpdateSchema()
submit_order_schema = SubmitOrderSchema()
message_create_schema = MessageCreateSchema()
inventory_create_schema = InventoryCreateSchema()
inventory_update_schema = InventoryUpdateSchema()
product_rating_schema = ProductRatingSchema()
newsletter_subscribe_schema = NewsletterSubscribeSchema()


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
