import React, { ReactNode, useState } from "react";
import { fetchQuery, graphql, useFragment, useMutation } from "react-relay";
import { useTranslation } from "react-i18next";
import { TFunction } from "i18next";
import { Controller, UseFormReturn, useFormContext } from "react-hook-form";

import { Card } from "../../../../../../ui/Card";
import { EditModeForm } from ".";
import { Heading } from "./util";
import type {
    VideoEditModeBlockData$data,
    VideoEditModeBlockData$key,
} from "./__generated__/VideoEditModeBlockData.graphql";
import type { VideoEditSaveMutation } from "./__generated__/VideoEditSaveMutation.graphql";
import type { VideoEditCreateMutation } from "./__generated__/VideoEditCreateMutation.graphql";
import { SearchableSelect } from "../../../../../../ui/SearchableSelect";
import { Creators, Thumbnail } from "../../../../../../ui/Video";
import { environment } from "../../../../../../relay";
import { VideoEditModeSearchQuery } from "./__generated__/VideoEditModeSearchQuery.graphql";
import { MovingTruck } from "../../../../../../ui/Waiting";
import { ErrorDisplay } from "../../../../../../util/err";


type VideoFormData = {
    event: string;
    showTitle: boolean;
    showLink: boolean;
};

type EditVideoBlockProps = {
    block: VideoEditModeBlockData$key;
};

export const EditVideoBlock: React.FC<EditVideoBlockProps> = ({ block: blockRef }) => {
    const { event, showTitle, showLink } = useFragment(graphql`
        fragment VideoEditModeBlockData on VideoBlock {
            event {
                __typename,
                ... on NotAllowed { dummy }
                ... on AuthorizedEvent {
                    id
                    title
                    series { title }
                    created
                    isLive
                    creators
                    syncedData { thumbnail duration startTime endTime }
                }
            }
            showTitle
            showLink
        }
    `, blockRef);


    const [save] = useMutation<VideoEditSaveMutation>(graphql`
        mutation VideoEditSaveMutation($id: ID!, $set: UpdateVideoBlock!) {
            updateVideoBlock(id: $id, set: $set) {
                ... VideoEditModeBlockData
                ... BlocksBlockData
                ... EditBlockUpdateRealmNameData
            }
        }
    `);

    const [create] = useMutation<VideoEditCreateMutation>(graphql`
        mutation VideoEditCreateMutation($realm: ID!, $index: Int!, $block: NewVideoBlock!) {
            addVideoBlock(realm: $realm, index: $index, block: $block) {
                ... ContentManageRealmData
            }
        }
    `);


    const { t } = useTranslation();

    const form = useFormContext<VideoFormData>();
    const { formState: { errors } } = form;

    const currentEvent = event?.__typename === "AuthorizedEvent"
        ? { ...event, ...event.syncedData, seriesTitle: event.series?.title }
        : undefined;

    const optionProps: ["showTitle" | "showLink", boolean, string][] = [
        ["showTitle", showTitle, t("manage.realm.content.show-title")],
        ["showLink", showLink, t("manage.realm.content.show-link")],
    ];

    return <EditModeForm create={create} save={save} map={(data: VideoFormData) => data}>
        <Heading>{t("manage.realm.content.event.event.heading")}</Heading>
        {"event" in errors && <div css={{ margin: "8px 0" }}>
            <Card kind="error">{t("manage.realm.content.event.event.invalid")}</Card>
        </div>}
        {event?.__typename === "NotAllowed" && <Card kind="error" css={{ margin: "8px 0" }}>
            {t("manage.realm.content.event.event.no-read-access-to-current")}
        </Card>}
        <Controller
            defaultValue={currentEvent?.id}
            name="event"
            rules={{ required: true }}
            render={({ field: { onChange, onBlur } }) => (
                <EventSelector defaultValue={currentEvent} {...{ onChange, onBlur }} />
            )}
        />

        <div css={{ display: "flex", flexDirection: "column", marginTop: 8 }}>
            {optionProps.map(([option, checked, title]) =>
                // eslint-disable-next-line react/jsx-key
                <DisplayOption {...{ form, option, checked, title }} />)
            }
        </div>
    </EditModeForm>;
};

type DisplayOption = {
    form: UseFormReturn<VideoFormData>;
    option: "showTitle" | "showLink";
    checked: boolean;
    title: string;
}

const DisplayOption: React.FC<DisplayOption> = (
    { form, option, checked, title }
) => <label>
    <input
        type="checkbox"
        defaultChecked={checked}
        {...form.register(option)}
        css={{ marginRight: 6 }}
    />
    {title}
</label>;

type EventSelectorProps = {
    onChange: (eventId?: string) => void;
    onBlur: () => void;
    defaultValue?: Option;
};

const EventSelector: React.FC<EventSelectorProps> = ({ onChange, onBlur, defaultValue }) => {
    const { t } = useTranslation();
    const [error, setError] = useState<ReactNode>(null);

    const query = graphql`
        query VideoEditModeSearchQuery($q: String!) {
            events: searchAllEvents(query: $q, writableOnly: false) {
                ... on EventSearchResults {
                    items {
                        id
                        title
                        seriesTitle
                        creators
                        thumbnail
                        isLive
                        created
                        duration
                        startTime
                        endTime
                    }
                }
            }
        }
    `;

    const loadEvents = (input: string, callback: (options: readonly Option[]) => void) => {
        fetchQuery<VideoEditModeSearchQuery>(environment, query, { q: input }).subscribe({
            next: ({ events }) => {
                if (events.items === undefined) {
                    setError(t("search.unavailable"));
                    return;
                }

                callback(events.items.map(item => ({
                    ...item,
                    // Events returned by the search API have a different ID
                    // prefix than other events. And the mutation expects an ID
                    // starting with `ev`.
                    id: item.id.replace(/^es/, "ev"),
                    syncedData: item,
                    series: item.seriesTitle === null ? null : { title: item.seriesTitle },
                })));
            },
            start: () => {},
            error: (error: Error) => setError(<ErrorDisplay error={error} />),
        });
    };

    return <>
        {error && <Card kind="error" css={{ marginBottom: 8 }}>{error}</Card>}
        <SearchableSelect
            loadOptions={loadEvents}
            format={formatOption}
            onChange={data => onChange(data?.id)}
            isDisabled={!!error}
            {...{ onBlur, defaultValue }}
        />
    </>;
};

const formatOption = (event: Option, t: TFunction) => (
    <div css={{ display: "flex", gap: 16, padding: "4px 0" }}>
        {event.syncedData === null
            ? <MovingTruck />
            : <Thumbnail
                css={{ width: 120, minWidth: 120 }}
                event={{
                    ...event,
                    syncedData: {
                        ...event.syncedData,
                        audioOnly: false, // TODO
                    },
                }}
            />}
        <div>
            <div>{event.title}</div>
            <Creators creators={event.creators} />
            {event.series?.title && <div css={{ fontSize: 14 }}>
                <i>{t("series.series")}</i>{": "}
                {event.series?.title}
            </div>}
        </div>
    </div>
);

type AuthorizedEvent = Extract<
    VideoEditModeBlockData$data["event"],
    { __typename: "AuthorizedEvent" }
>;
type Option = Omit<AuthorizedEvent, "__typename">;
