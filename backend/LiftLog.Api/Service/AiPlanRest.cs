using System.Text.Json;
using System.Text.Json.Nodes;

namespace LiftLog.Api.Service;

/// <summary>
/// The rest between sets as the AI planner speaks it, and its translation to the
/// app's wire shape.
/// <para>
/// The app has one rest and an optional different rest after a failed set, but its
/// plan JSON still carries the three fields older app versions read
/// (<c>minRest</c>, <c>maxRest</c>, <c>failureRest</c>; see <c>Rest.fromJSON</c> in
/// the app). So the model is given the new shape (<c>rest</c>, optional
/// <c>failedSetRest</c>) and every plan is turned back into the three fields before
/// it reaches the app: <c>minRest = maxRest = rest</c>, <c>failureRest</c> = the
/// failed-set rest, or the rest when there is none. A rest already in the old shape
/// passes through untouched, so both app versions read it as they always did.
/// </para>
/// </summary>
public static class AiPlanRest
{
    private const string RestKey = "restBetweenSets";

    /// <summary>The <c>Rest</c> definition the model is asked to fill.</summary>
    public static JsonElement SchemaDefinition { get; } =
        ParseElement(
            """
            {
              "type": "object",
              "properties": {
                "rest": {
                  "$ref": "#/definitions/Duration",
                  "description": "The rest between sets."
                },
                "failedSetRest": {
                  "$ref": "#/definitions/Duration",
                  "description": "A different rest after a set where the user failed to hit their target reps. Leave it out to rest the same as after any other set; only set it when the plan calls for a different rest after a failed set."
                }
              },
              "required": ["rest"],
              "description": "The rest between sets: one rest, plus an optional different rest after a failed set."
            }
            """
        );

    /// <summary>
    /// Returns <paramref name="definitions"/> with its <c>Rest</c> definition replaced
    /// by <see cref="SchemaDefinition"/>.
    /// </summary>
    public static JsonElement WithRestDefinition(JsonElement definitions)
    {
        var node =
            JsonNode.Parse(definitions.GetRawText()) as JsonObject
            ?? throw new InvalidOperationException("AiPlan schema 'definitions' is not an object.");
        if (!node.ContainsKey("Rest"))
        {
            throw new InvalidOperationException("AiPlan schema is missing a 'Rest' definition.");
        }
        node["Rest"] = JsonNode.Parse(SchemaDefinition.GetRawText());
        return ParseElement(node.ToJsonString());
    }

    private static JsonElement ParseElement(string json)
    {
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    /// <summary>
    /// Rewrites every rest in <paramref name="blueprint"/> into the three-field wire
    /// shape the app reads. Safe on a partially streamed blueprint: a rest with no
    /// value yet is left as it is.
    /// </summary>
    public static void ToWireShape(JsonNode? blueprint)
    {
        switch (blueprint)
        {
            case JsonObject obj:
                foreach (var (key, value) in obj.ToList())
                {
                    if (key == RestKey && value is JsonObject rest)
                    {
                        RestToWireShape(rest);
                    }
                    else
                    {
                        ToWireShape(value);
                    }
                }
                break;
            case JsonArray array:
                foreach (var item in array)
                {
                    ToWireShape(item);
                }
                break;
        }
    }

    private static void RestToWireShape(JsonObject rest)
    {
        if (rest["rest"] is not JsonValue restValue)
        {
            return;
        }
        var failedSetRest = rest["failedSetRest"] as JsonValue ?? restValue;

        rest.Clear();
        rest["minRest"] = restValue.DeepClone();
        rest["maxRest"] = restValue.DeepClone();
        rest["failureRest"] = failedSetRest.DeepClone();
    }
}
