import React from "react";
import { graphql, loadQuery } from "react-relay/hooks";
import type { PreloadedQuery } from "react-relay/hooks";

import type { VideoQuery, VideoQueryResponse } from "../query-types/VideoQuery.graphql";
import { environment as relayEnv } from "../relay";
import { Root } from "../layout/Root";
import { PATH_SEGMENT_REGEX } from "./Realm";
import { NotFound } from "./NotFound";
import { Nav } from "../layout/Navigation";
import { TextBlock } from "../ui/Blocks/Text";
import { Player, Track } from "../ui/player";
import { useTranslation } from "react-i18next";
import { useTitle } from "../util";
import { SeriesBlockFromSeries } from "../ui/Blocks/Series";
import { makeRoute } from "../rauta";
import { QueryLoader } from "../util/QueryLoader";
import { UserData$key } from "../query-types/UserData.graphql";


type Prep = {
    queryRef: PreloadedQuery<VideoQuery>;
    realmPath: string;
    id: string;
};

const b64regex = "[a-zA-Z0-9\\-_]";

export const VideoRoute = makeRoute<Prep>({
    path: `((?:/${PATH_SEGMENT_REGEX})*)/v/(${b64regex}+)`,
    queryParams: [],
    // TODO: check if video belongs to realm
    prepare: ({ pathParams: [realmPath, videoId] }) => loadVideoQuery(`ev${videoId}`, realmPath),
    render: prep => render(prep),
    dispose: prep => prep.queryRef.dispose(),
});

export const DirectVideoRoute = makeRoute<Prep>({
    path: `/!(${b64regex}+)`,
    queryParams: [],
    prepare: ({ pathParams: [videoId] }) => loadVideoQuery(`ev${videoId}`, "/"),
    render: prep => render(prep),
    dispose: prep => prep.queryRef.dispose(),
});

const loadVideoQuery = (id: string, realmPath: string): Prep => {
    const queryRef = loadQuery<VideoQuery>(relayEnv, query, { id, realmPath });
    return { queryRef, realmPath, id };
};

const render = ({ queryRef, realmPath, id }: Prep): JSX.Element => (
    <QueryLoader
        {... { query, queryRef }}
        render={result => {
            const { event, realm } = result;

            // TODO: this realm check is useless once we check a video belongs to a realm.
            return !event || !realm
                ? <NotFound kind="video" />
                : <VideoPage {...{ event, realm, userQuery: result, realmPath, id }} />;
        }}
    />
);


const query = graphql`
    query VideoQuery($id: ID!, $realmPath: String!) {
        ... UserData
        event(id: $id) {
            title
            description
            creator
            created
            updated
            duration
            series { title, ...SeriesBlockSeriesData }
            tracks { uri flavor mimetype resolution }
        }
        realm: realmByPath(path: $realmPath) {
            ... NavigationData
        }
    }
`;

type Props = {
    event: NonNullable<VideoQueryResponse["event"]>;
    realm: NonNullable<VideoQueryResponse["realm"]>;
    userQuery: UserData$key;
    realmPath: string;
    id: string;
};

const VideoPage: React.FC<Props> = ({ event, realm, userQuery, realmPath, id }) => {
    const { t, i18n } = useTranslation();

    const createdDate = new Date(event.created);
    const created = createdDate.toLocaleString(i18n.language);

    // If the event was updated only shortly after the creation date, we don't
    // want to show it.
    const updatedDate = new Date(event.updated);
    const updated = updatedDate.getTime() - createdDate.getTime() > 5 * 60 * 1000
        ? updatedDate.toLocaleString(i18n.language)
        : null;

    const { title, tracks, description } = event;
    const duration = event.duration ?? 0; // <-- TODO
    useTitle(title);
    return (
        <Root nav={<Nav fragRef={realm} />} userQuery={userQuery}>
            <Player tracks={tracks as Track[]} title={title} duration={duration} />
            <h1 css={{ marginTop: 24, fontSize: 24 }}>{title}</h1>
            {description !== null && <TextBlock content={description} />}
            <table css={{
                marginBottom: 100,
                "& tr": {
                    "& > td:first-child": {
                        color: "var(--grey40)",
                        paddingRight: 32,
                    },
                },
            }}>
                <tbody>
                    <MetaDatum label={t("video.creator")} value={event.creator} />
                    <MetaDatum label={t("video.created")} value={created} />
                    <MetaDatum label={t("video.updated")} value={updated} />
                    <MetaDatum label={t("video.part-of-series")} value={event.series?.title} />
                </tbody>
            </table>
            {event.series && <SeriesBlockFromSeries
                realmPath={realmPath} fragRef={event.series}
                title={t("video.more-from-series", { series: event.series.title })}
                activeEventId={id}
            />}
        </Root>
    );
};

type MetaDatumProps = {
    label: string;
    value: string | null | undefined;
};

const MetaDatum: React.FC<MetaDatumProps> = ({ label, value }) => {
    if (value == null) {
        return null;
    }

    return <tr>
        <td>{label}:</td>
        <td>{value}</td>
    </tr>;
};
